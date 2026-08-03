import { fetchTourApiPage } from "@/server/tourism/tourApiClient";

export type TourApiDetailItem = Record<string, unknown>;

export type TourApiPlaceDetailPayload = {
  common: TourApiDetailItem | null;
  intro: TourApiDetailItem | null;
  info: TourApiDetailItem[];
  images: TourApiDetailItem[];
};

type FetchTourApiPlaceDetailInput = {
  contentId: string;
  contentTypeId: string | null;
};

export async function fetchTourApiPlaceDetail({
  contentId,
  contentTypeId,
}: FetchTourApiPlaceDetailInput): Promise<TourApiPlaceDetailPayload> {
  const pageParameters = {
    pageNo: "1",
    numOfRows: "100",
  };
  const commonPromise = fetchTourApiPage<TourApiDetailItem>(
    "detailCommon2",
    {
      ...pageParameters,
      contentId,
    },
  );
  const imagePromise = fetchTourApiPage<TourApiDetailItem>(
    "detailImage2",
    {
      ...pageParameters,
      contentId,
    },
  );
  const introPromise = contentTypeId
    ? fetchTourApiPage<TourApiDetailItem>("detailIntro2", {
        ...pageParameters,
        contentId,
        contentTypeId,
      })
    : Promise.resolve({ items: [] });
  const infoPromise = contentTypeId
    ? fetchTourApiPage<TourApiDetailItem>("detailInfo2", {
        ...pageParameters,
        contentId,
        contentTypeId,
      })
    : Promise.resolve({ items: [] });

  const [common, intro, info, images] = await Promise.all([
    commonPromise,
    introPromise,
    infoPromise,
    imagePromise,
  ]);

  return {
    common: common.items[0] ?? null,
    intro: intro.items[0] ?? null,
    info: info.items,
    images: images.items,
  };
}
