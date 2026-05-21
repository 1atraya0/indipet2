import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.COUNTRY_STATE_CITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Geo API key not configured" }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.countrystatecity.in/v1/countries", {
      headers: { "X-CSCAPI-KEY": apiKey },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch countries" }, { status: 502 });
    }

    const raw = await response.json() as Array<{ name: string; iso2: string; phonecode: string; currency: string }>;
    const countries = raw.map((c) => ({ name: c.name, iso2: c.iso2, phonecode: c.phonecode, currency: c.currency }));

    return NextResponse.json(countries);
  } catch {
    return NextResponse.json({ error: "Failed to fetch countries" }, { status: 502 });
  }
}
