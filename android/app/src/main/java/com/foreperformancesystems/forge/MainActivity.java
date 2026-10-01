package com.foreperformancesystems.forge;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins (not npm packages) are registered by hand, before the bridge
        // loads -- the Android twin of the Swift plugins ios/App/App registers through
        // ForgeBridgeViewController.
        registerPlugin(GooglePlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
