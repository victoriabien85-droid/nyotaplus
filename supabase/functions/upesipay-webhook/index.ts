// Supabase Edge Function: upesipay-webhook
// Receives payment status callbacks from UPesi Pay
// Configure this URL in your UPesi Pay dashboard:
// https://sxxjmbyjytjqyyqgeeon.supabase.co/functions/v1/upesipay-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("UPesi Pay webhook received:", JSON.stringify(payload));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Extract common fields from UPesi Pay webhook payload
    const transactionId = payload?.transaction_id || payload?.data?.transaction_id;
    const reference = payload?.reference || payload?.data?.reference;
    const status = payload?.status?.toLowerCase() || payload?.data?.status?.toLowerCase();
    const amount = payload?.amount || payload?.data?.amount;
    const phone = payload?.phone_number || payload?.data?.phone_number;

    // Map UPesi Pay status to our status
    const mappedStatus =
      status === "success" || status === "completed" ? "success"
      : status === "failed" || status === "cancelled" ? "failed"
      : "pending";

    // Update payment_transactions table
    const { error } = await supabase
      .from("payment_transactions")
      .update({
        status: mappedStatus,
        gateway_reference: transactionId,
        webhook_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .or(`reference.eq.${reference},gateway_reference.eq.${transactionId}`);

    if (error) {
      console.error("DB update error:", error);
    }

    // If payment succeeded, update the loan application status
    if (mappedStatus === "success" && reference) {
      await supabase
        .from("loan_applications")
        .update({ payment_status: "paid", payment_reference: reference })
        .eq("payment_reference", reference);
    }

    // Always return 200 to acknowledge receipt
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    // Still return 200 so UPesi Pay doesn't keep retrying on parse errors
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
