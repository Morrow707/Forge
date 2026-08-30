import Foundation
import StoreKit
import Capacitor

// StoreKit 2 purchase flow for the three Free Agent subscription tiers --
// see shared/free-agent-tiers.ts's appleProductIdForFreeAgentTier (the ids
// below must match it exactly) and server/apple-iap.ts (the server-side
// verification these purchases feed into via POST
// /api/athlete/apple-iap/verify). This plugin only ever hands back the raw
// signed JWS string StoreKit gives it -- it never decides on its own
// whether a purchase is real; that's entirely the server's job, the same
// "client proposes, server verifies" split every other AI/tracking feature
// in this app already follows.
//
// Deliberately does NOT call transaction.finish() inside purchase() itself
// -- finishing tells Apple "this app is done with this transaction," which
// should only happen once the server has actually recorded the
// entitlement, not the moment StoreKit hands it over. The JS side calls
// finishTransaction after POST /api/athlete/apple-iap/verify succeeds (see
// client/src/lib/apple-iap.ts); an unfinished transaction just keeps
// reappearing via the transactionUpdated listener/restorePurchases below
// until it's explicitly finished, so a dropped network call between
// purchase and server verification can't silently lose a real purchase.
@objc(AppleIapPlugin)
public class AppleIapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleIapPlugin"
    public let jsName = "AppleIap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise)
    ]

    // Must match FREE_AGENT_TIER_ORDER's ids via
    // appleProductIdForFreeAgentTier exactly (shared/free-agent-tiers.ts) --
    // Swift can't import that TS file directly, so this is the one place
    // the convention has to be hand-kept in sync. These also have to exist
    // as real, priced auto-renewable subscription Products in one App Store
    // Connect subscription group before getProducts can ever return
    // anything.
    private static let productIds = [
        "com.foreperformancesystems.forge.freeagent.ai_coach",
        "com.foreperformancesystems.forge.freeagent.ai_coach_video",
        "com.foreperformancesystems.forge.freeagent.family"
    ]

    private var updateListenerTask: Task<Void, Never>?

    override public func load() {
        // Transaction.updates catches everything a direct purchase() call
        // doesn't: Ask to Buy approvals that complete later, a subscription
        // bought on another device, StoreKit finishing a renewal in the
        // background. Without this, those entitlements would only ever
        // reach the server the next time the athlete happens to open the
        // upgrade page and tap Restore.
        updateListenerTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self, case .verified(let transaction) = result else { continue }
                self.notifyListeners("transactionUpdated", data: [
                    "transactionId": String(transaction.id),
                    "productId": transaction.productID,
                    "signedTransactionInfo": result.jwsRepresentation
                ])
            }
        }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: AppleIapPlugin.productIds)
                let payload = products.map { product -> [String: Any] in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice
                    ]
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("Could not load products", nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Unknown product")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Purchase could not be verified on-device")
                        return
                    }
                    call.resolve([
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID,
                        "signedTransactionInfo": verification.jwsRepresentation
                    ])
                case .userCancelled:
                    call.reject("cancelled", "cancelled")
                case .pending:
                    // Ask to Buy or another Apple-side hold -- not a
                    // failure, just not resolved yet. The eventual approval
                    // (or denial) arrives through Transaction.updates
                    // above, same as a purchase made on another device.
                    call.reject("pending", "pending")
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed", nil, error)
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionIdString = call.getString("transactionId"), let transactionId = UInt64(transactionIdString) else {
            call.reject("transactionId is required")
            return
        }
        Task {
            for await result in Transaction.all {
                guard case .verified(let transaction) = result, transaction.id == transactionId else { continue }
                await transaction.finish()
                call.resolve([:])
                return
            }
            // Already finished (or never existed) reads as success either
            // way -- the caller's goal ("this transaction shouldn't nag me
            // again") is already true.
            call.resolve([:])
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            if #available(iOS 16.0, *) {
                try? await AppStore.sync()
            }
            var restored: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result else { continue }
                restored.append([
                    "transactionId": String(transaction.id),
                    "productId": transaction.productID,
                    "signedTransactionInfo": result.jwsRepresentation
                ])
            }
            call.resolve(["transactions": restored])
        }
    }
}
