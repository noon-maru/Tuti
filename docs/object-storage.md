# Tuti 오브젝트 스토리지

Tuti의 저널 이미지는 Garage의 S3 호환 API로 저장한다. Garage는 별도
Compose 스택으로 실행하며 실제 데이터는 Git 저장소 밖의 NAS 공유 폴더에
보관한다.

## 파일 구성

```text
docker-compose.storage.yml
.env.storage
infra/garage/garage.toml

/volume1/tuti/object-storage/
├── data/
├── metadata/
└── snapshots/
```

`.env.storage`에는 Garage 내부 통신 비밀값과 S3 접근 키가 들어가므로
커밋하지 않는다. `.env.storage.example`을 복사한 뒤 각 값을 별도로
생성한다.

## 초기 설정

```bash
cp .env.storage.example .env.storage
```

다음 명령 결과를 `.env.storage`의 해당 항목에 넣는다.

```bash
openssl rand -hex 32
openssl rand -base64 32
openssl rand -base64 32
printf 'GK%s\n' "$(openssl rand -hex 16)"
openssl rand -hex 32
```

NAS 영구 저장 폴더를 생성한다.

```bash
sudo mkdir -p \
  /volume1/tuti/object-storage/data \
  /volume1/tuti/object-storage/metadata \
  /volume1/tuti/object-storage/snapshots
```

## 실행

Compose 구성을 먼저 검증한다.

```bash
sudo docker compose \
  --env-file .env.storage \
  -f docker-compose.storage.yml \
  config --quiet
```

스토리지를 시작한다.

```bash
sudo docker compose \
  --env-file .env.storage \
  -f docker-compose.storage.yml \
  up -d
```

상태와 로그를 확인한다.

```bash
sudo docker compose \
  --env-file .env.storage \
  -f docker-compose.storage.yml \
  ps -a
```

```bash
sudo docker compose \
  --env-file .env.storage \
  -f docker-compose.storage.yml \
  logs --tail=100 garage
```

Garage 클러스터 상태와 생성된 버킷을 확인한다.

```bash
sudo docker compose \
  --env-file .env.storage \
  -f docker-compose.storage.yml \
  exec garage /garage status
```

```bash
sudo docker compose \
  --env-file .env.storage \
  -f docker-compose.storage.yml \
  exec garage /garage bucket list
```

## Next.js 서버 설정

Next.js 서버는 `tuti-storage` Docker 네트워크에서
`http://garage:3900`으로 Garage에 접근한다. `.env`에 다음 서버 전용
설정을 추가한다.

```env
OBJECT_STORAGE_ENABLED=true
OBJECT_STORAGE_ENDPOINT=http://garage:3900
OBJECT_STORAGE_REGION=tuti
OBJECT_STORAGE_BUCKET=tuti-journal-images
OBJECT_STORAGE_ACCESS_KEY_ID=<GARAGE_DEFAULT_ACCESS_KEY 값>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<GARAGE_DEFAULT_SECRET_KEY 값>
```

브라우저에 노출되지 않도록 이 설정에는 `NEXT_PUBLIC_` 접두사를 사용하지
않는다. 개발·운영 앱 Compose는 외부 `tuti-storage` 네트워크에 참여하며,
스토리지 Compose를 먼저 실행해 해당 네트워크가 존재해야 한다.

S3 요청은 `src/server/storage/objectStorage.ts`의 서버 전용 모듈을
사용한다. 이 모듈은 연결 확인, 업로드, 조회, 존재 확인, 삭제를 제공하며
Garage 호환성을 위해 path-style 요청을 사용한다.

## 저널 이미지 흐름

저널 작성 화면에서 잘라낸 JPEG·PNG·WebP 이미지는 기존과 동일하게 API로
전달된다. 서버는 이미지를 최대 1200×900 크기, 품질 82의 WebP로 변환한
뒤 Garage에 저장한다. 객체 키는 다음 구조를 사용한다.

```text
journal-images/{사용자 ID}/{기록 ID}/{임의 UUID}.webp
```

DB의 `journal_entries.image`에는 객체 키만 남는다. 기록 조회 응답에서는
서버가 객체 키를 서명된 `/api/journal-entry-images/{기록 ID}` 주소로
변환한다. 웹에서는 같은 출처의 API를, Capacitor에서는
`NEXT_PUBLIC_API_BASE_URL`의 원격 API를 사용하므로 화면 코드는 플랫폼별로
나뉘지 않는다.

이미지 API는 다음 원칙으로 동작한다.

- Garage의 S3 주소와 접근 키를 클라이언트에 공개하지 않는다.
- 서명은 기록 ID, 소유자 ID, 객체 키, 최종 수정 시각을 함께 검증한다.
- 기록 수정으로 이미지가 교체되거나 기록이 삭제되면 기존 객체도 삭제한다.
- 업로드 뒤 DB 저장에 실패한 새 객체는 즉시 정리한다.
- 기존 외부 이미지 URL과 DB에 남아 있는 Data URL은 마이그레이션 전까지
  그대로 표시한다.
- 업로드 입력은 JPEG·PNG·WebP로 제한하고 디코딩 후 최대 5MB, 최대
  1,600만 픽셀까지만 허용한다.

## 운영 원칙

- S3 API는 NAS의 `127.0.0.1:3900`과 `tuti-storage` Docker 네트워크에서만
  접근한다.
- Garage 관리 API는 호스트 포트에 공개하지 않는다.
- Next.js 서버만 S3 Access Key와 Secret Key를 보유한다.
- DB에는 이미지 본문이나 고정 URL 대신 객체 키만 저장한다.
- 단일 노드의 `replication_factor = 1`은 Garage 자체 복제를 제공하지
  않는다. `/volume1/tuti/object-storage` 전체를 별도 장치나 원격지에
  정기적으로 백업한다.
- 운영 논리 백업은 `tuti-prod-backup`이 S3 API로 모든 객체를 읽어 PostgreSQL
  전체 백업과 같은 시각의 디렉터리에 저장한다. 이 디렉터리도 Hyper Backup으로
  NAS 밖에 복제한다. 복구 절차는 `docs/operations.md`를 따른다.
