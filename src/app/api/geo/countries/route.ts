import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    { name: "India", iso2: "IN", phonecode: "+91", currency: "INR" },
  ]);
}
