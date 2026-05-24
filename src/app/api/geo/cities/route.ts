import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const apiKey = process.env.COUNTRY_STATE_CITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Geo API key not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const stateCode = (searchParams.get("state") ?? "").trim().toUpperCase();
  if (!stateCode) {
    return NextResponse.json([]);
  }

  try {
    const response = await fetch(
      `https://api.countrystatecity.in/v1/countries/IN/states/${stateCode}/cities`,
      {
        headers: { "X-CSCAPI-KEY": apiKey },
        next: { revalidate: 86400 },
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch cities" }, { status: 502 });
    }

    const raw = await response.json() as Array<{ name: string }>;
    const cities = raw
      .map((city) => ({ name: city.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(cities);
  } catch {
    return NextResponse.json({ error: "Failed to fetch cities" }, { status: 502 });
  }
}