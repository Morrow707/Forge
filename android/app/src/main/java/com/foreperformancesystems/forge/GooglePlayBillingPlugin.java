package com.foreperformancesystems.forge;

import android.app.Activity;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Google Play Billing for the Free Agent tiers and add-ons -- the Android twin of
 * ios/App/App/AppleIapPlugin.swift, with the same four methods and the same contract:
 * the plugin never grants anything. A purchase resolves with the purchase token, the
 * web side sends it to POST /api/athlete/google-play/verify, and only once the server
 * has confirmed it with Google's Play Developer API does the web side call acknowledge
 * (an unacknowledged subscription is refunded by Play after three days, which is the
 * same fail-closed shape as never calling finishTransaction on iOS).
 *
 * Play's model: a subscription PRODUCT (freeagent_basic ...) has BASE PLANS (monthly) and
 * the purchase flow needs the base plan's offer token, read off ProductDetails here so the
 * web side only ever names a product id, exactly as it does on iOS.
 */
@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin {
    private BillingClient billingClient;
    private final List<ProductDetails> knownProducts = new ArrayList<>();
    private PluginCall pendingPurchase;

    private final PurchasesUpdatedListener purchasesUpdatedListener = (result, purchases) -> {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (call != null) call.reject("cancelled", "cancelled");
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            if (call != null) call.reject("Purchase failed: " + result.getDebugMessage());
            return;
        }
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                // Pending (a cash top-up, a parental approval) -- the eventual state arrives
                // through this same listener; the web side's purchaseUpdated handler verifies
                // it then. Same shape as StoreKit's .pending.
                if (call != null) { call.reject("pending", "pending"); call = null; }
                continue;
            }
            JSObject payload = toPayload(purchase);
            if (call != null) { call.resolve(payload); call = null; }
            else notifyListeners("purchaseUpdated", payload);
        }
        if (call != null) call.reject("No purchase returned");
    };

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(purchasesUpdatedListener)
            .enablePendingPurchases()
            .build();
    }

    private void ensureConnected(Runnable onReady, PluginCall call) {
        if (billingClient.isReady()) { onReady.run(); return; }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) onReady.run();
                else call.reject("Google Play Billing unavailable: " + result.getDebugMessage());
            }
            @Override public void onBillingServiceDisconnected() { /* reconnects on next call */ }
        });
    }

    private static JSObject toPayload(Purchase purchase) {
        JSObject o = new JSObject();
        o.put("purchaseToken", purchase.getPurchaseToken());
        o.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        o.put("orderId", purchase.getOrderId());
        o.put("acknowledged", purchase.isAcknowledged());
        return o;
    }

    /** options.productIds: string[] -- every Play subscription product the app sells. */
    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds");
        if (ids == null) { call.reject("productIds is required"); return; }
        List<QueryProductDetailsParams.Product> wanted = new ArrayList<>();
        try {
            for (Object id : ids.toList()) {
                wanted.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(String.valueOf(id))
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build());
            }
        } catch (Exception e) { call.reject("productIds must be strings"); return; }
        ensureConnected(() -> billingClient.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(wanted).build(),
            (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Could not load products: " + result.getDebugMessage());
                    return;
                }
                knownProducts.clear();
                knownProducts.addAll(details);
                JSArray out = new JSArray();
                for (ProductDetails d : details) {
                    JSObject p = new JSObject();
                    p.put("id", d.getProductId());
                    p.put("displayName", d.getName());
                    p.put("description", d.getDescription());
                    String price = null;
                    List<ProductDetails.SubscriptionOfferDetails> offers = d.getSubscriptionOfferDetails();
                    if (offers != null && !offers.isEmpty()) {
                        List<ProductDetails.PricingPhase> phases = offers.get(0).getPricingPhases().getPricingPhaseList();
                        if (!phases.isEmpty()) price = phases.get(phases.size() - 1).getFormattedPrice();
                    }
                    p.put("displayPrice", price);
                    out.put(p);
                }
                JSObject ret = new JSObject();
                ret.put("products", out);
                call.resolve(ret);
            }), call);
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) { call.reject("productId is required"); return; }
        ProductDetails details = null;
        for (ProductDetails d : knownProducts) if (d.getProductId().equals(productId)) details = d;
        if (details == null || details.getSubscriptionOfferDetails() == null || details.getSubscriptionOfferDetails().isEmpty()) {
            call.reject("Unknown product");
            return;
        }
        String offerToken = details.getSubscriptionOfferDetails().get(0).getOfferToken();
        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(List.of(
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offerToken)
                    .build()))
            .build();
        Activity activity = getActivity();
        final ProductDetails chosen = details;
        ensureConnected(() -> {
            pendingPurchase = call;
            call.setKeepAlive(true);
            BillingResult result = billingClient.launchBillingFlow(activity, params);
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchase = null;
                call.reject("Could not open the purchase sheet: " + result.getDebugMessage());
            }
        }, call);
    }

    /** Called by the web side only after the server verified the token. */
    @PluginMethod
    public void acknowledge(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null) { call.reject("purchaseToken is required"); return; }
        ensureConnected(() -> billingClient.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(),
            (result) -> {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) call.resolve();
                else call.reject("Could not acknowledge purchase: " + result.getDebugMessage());
            }), call);
    }

    /** Every active subscription this Google account holds for the app -- the Restore path. */
    @PluginMethod
    public void restorePurchases(PluginCall call) {
        ensureConnected(() -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Could not read purchases: " + result.getDebugMessage());
                    return;
                }
                JSArray out = new JSArray();
                for (Purchase p : purchases) {
                    if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) out.put(toPayload(p));
                }
                JSObject ret = new JSObject();
                ret.put("transactions", out);
                call.resolve(ret);
            }), call);
    }
}
