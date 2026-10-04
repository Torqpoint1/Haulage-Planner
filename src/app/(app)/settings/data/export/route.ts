import { NextResponse } from "next/server";
import { NotAllowedError, requireCapability } from "@/lib/auth/session";
import { buildExport } from "@/lib/data-protection/export";
import { londonToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Admins download everything their organisation holds as one JSON file (spec 12). */
export async function GET() {
  try {
    const session = await requireCapability("settings.manage");
    const supabase = await createClient();
    const data = await buildExport(supabase, session.membership.organisation.id);
    const slug =
      session.membership.organisation.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "organisation";
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-data-${londonToday()}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error(error);
    return NextResponse.json(
      { error: "The export didn't finish. Try again in a minute." },
      { status: 500 },
    );
  }
}
