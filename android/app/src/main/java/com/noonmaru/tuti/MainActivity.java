package com.noonmaru.tuti;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int EXPANDED_LAYOUT_MIN_WIDTH_DP = 600;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        updateOrientationPolicy(getResources().getConfiguration());
    }

    @Override
    public void onResume() {
        super.onResume();
        updateOrientationPolicy(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateOrientationPolicy(newConfig);
    }

    private void updateOrientationPolicy(Configuration configuration) {
        boolean expanded =
                configuration.smallestScreenWidthDp >= EXPANDED_LAYOUT_MIN_WIDTH_DP;
        int requestedOrientation = expanded
                ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;

        if (getRequestedOrientation() != requestedOrientation) {
            setRequestedOrientation(requestedOrientation);
        }
    }
}
