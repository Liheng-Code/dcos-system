import { NextRequest, NextResponse } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";
import { getModel, BimError } from "@/lib/bim/bim-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createAdminClient();
    const { resolveTenantId } = await import("@/lib/bim/bim-service");
    const tenantId = await resolveTenantId(supabase, user.id);
    const model = await getModel(supabase, tenantId, id);

    // Extract storage path from file_url
    // URL format: https://xxx.supabase.co/storage/v1/object/public/bim-models/{path}
    const fileUrl = model.file_url;
    const storageMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/bim-models\/(.+)$/);
    if (!storageMatch) {
      return NextResponse.json({ error: "Invalid file URL" }, { status: 400 });
    }
    const storagePath = decodeURIComponent(storageMatch[1]);

    // Download via admin client (bypasses RLS)
    const { data, error } = await supabase.storage
      .from("bim-models")
      .download(storagePath);

    if (error || !data) {
      console.error("[BIM] Storage download error:", error);
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    // Convert Blob to ArrayBuffer and return as octet-stream
    const buffer = await data.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] GET /models/:id/file:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
