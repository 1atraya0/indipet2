import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const apiKey = process.env.COUNTRY_STATE_CITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Geo API key not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const countryCode = (searchParams.get("country") ?? "IN").toUpperCase();

  try {
    const response = await fetch(
      `https://api.countrystatecity.in/v1/countries/${countryCode}/states`,
      {
        headers: { "X-CSCAPI-KEY": apiKey },
        next: { revalidate: 86400 },
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch states" }, { status: 502 });
    }

    const raw = await response.json() as Array<{ name: string; iso2: string; state_code?: string }>;
    const states = raw
      .map((s) => ({ name: s.name, iso2: s.iso2 ?? s.state_code ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(states);
  } catch {
    return NextResponse.json({ error: "Failed to fetch states" }, { status: 502 });
  }
}
