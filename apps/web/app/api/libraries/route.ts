import { NextResponse } from "next/server";

// Placeholder route for /api/libraries (no sector)
// Returns an empty list – sufficient for the licensing entitlement check.
export async function GET() {
  return NextResponse.json([]);
}

export async function POST() {
  return NextResponse.json({ error: "Sector required" }, { status: 400 });
}

export async function PUT() {
  return NextResponse.json({ error: "Sector required" }, { status: 400 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Sector required" }, { status: 400 });
}
