// Supabase Edge Function: stk-push
// Payment gateway: UPesi Pay
// Called by frontend with: { phoneNumber, amount, loanAmount, applicantName, nationalId }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UPESIPAY_API_KEY = Deno.env.get("UPESIPAY_API_KEY")!;
const UPESIPAY_BASE_URL = "https://api.upesipay.com/v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phoneNumber, amount, loanAmount, applicantName, nationalId } = await req.json();

    if (!phoneNumber || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: "phoneNumber and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number to international format (+254...)
    let phone = String(phoneNumber).replace(/\s+/g, "");
    if (phone.startsWith("0")) phone = "+254" + phone.slice(1);
    if (phone.startsWith("254") && !phone.startsWith("+")) phone = "+" + phone;

    // Generate a unique reference ID
    const reference = `NYOTTA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Initiate UPesi Pay STK push
    const upesiResponse = await fetch(`${UPESIPAY_BASE_URL}/payments/initiate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${UPESIPAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(amount),
        phone_number: phone,
        reference,
        description: `Nyotta Plus loan application fee - ${applicantName || "Applicant"} (ID: ${nationalId || "N/A"}) - Loan: KES ${loanAmount || amount}`,
      }),
    });

    const upesiData = await upesiResponse.json();

    if (!upesiResponse.ok) {
      console.error("UPesi Pay error:", upesiData);
      return new Response(
        JSON.stringify({ success: false, error: upesiData?.message || "Payment initiation failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the transaction in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("payment_transactions").insert({
      reference,
      phone_number: phone,
      amount: Number(amount),
      loan_amount: loanAmount ? Number(loanAmount) : null,
      applicant_name: applicantName || null,
      national_id: nationalId || null,
      gateway: "upesipay",
      status: "pending",
      gateway_reference: upesiData?.data?.transaction_id || upesiData?.transaction_id || null,
      raw_response: upesiData,
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "STK Push sent! Enter your M-Pesa PIN on your phone.",
        reference,
        transaction_id: upesiData?.data?.transaction_id || upesiData?.transaction_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("stk-push function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
