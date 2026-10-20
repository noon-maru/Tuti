package com.noonmaru.tuti;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TutiPushPrivacy")
public class TutiPushPrivacyPlugin extends Plugin {
    // 토큰 발급·삭제 SDK Task가 끝날 때까지 순서를 유지하며 UI 스레드는 막지 않는다.
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        FirebaseMessaging.getInstance().setAutoInitEnabled(false);
    }

    @PluginMethod
    public void registerToken(PluginCall call) {
        worker.execute(() -> {
            try {
                FirebaseMessaging messaging = FirebaseMessaging.getInstance();
                // 수동 등록만 허용하고 등록 이후에도 자동 초기화를 켜지 않는다.
                messaging.setAutoInitEnabled(false);
                String token = Tasks.await(messaging.getToken());
                JSObject result = new JSObject();
                result.put("value", token);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("푸시 등록을 완료하지 못했어요. 연결 상태를 확인해주세요.");
            }
        });
    }

    @PluginMethod
    public void revoke(PluginCall call) {
        FirebaseMessaging.getInstance().setAutoInitEnabled(false);
        worker.execute(() -> {
            Exception failure = null;
            try {
                Tasks.await(FirebaseMessaging.getInstance().deleteToken());
            } catch (Exception error) {
                failure = error;
            }
            // 토큰 삭제 실패 시에도 FID 삭제를 시도하지만 정리 성공으로 표시하지 않는다.
            try {
                Tasks.await(FirebaseInstallations.getInstance().delete());
            } catch (Exception error) {
                failure = error;
            }
            if (failure != null) {
                call.reject("기기의 알림 정보 정리가 끝나지 않았어요. 연결 후 다시 시도해주세요.");
            } else {
                call.resolve();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdown();
    }
}
