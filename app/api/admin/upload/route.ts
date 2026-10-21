import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase-admin";

const imageTypes = {
  "image/jpeg": { extension: "jpg", matches: (buffer: Buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: "png", matches: (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: "webp", matches: (buffer: Buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" },
} as const;

export async function POST(req: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
    }
    if (!admin.isSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admins can upload images." }, { status: 403 });
    }

    const formData = await req.formData();
    const formFile = formData.get("file");
    const file = formFile instanceof File ? formFile : null;

    if (!file) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image files must be no larger than 5 MB." }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const imageType = imageTypes[file.type as keyof typeof imageTypes];
    if (!imageType || !imageType.matches(buffer)) {
      return NextResponse.json({ error: "Upload a valid JPEG, PNG, or WEBP image." }, { status: 400 });
    }

    const fileName = `${randomUUID()}.${imageType.extension}`;
    const db = adminSupabase();
    const { data: uploadData, error: uploadError } = await db.storage
      .from("spa-images")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError || !uploadData) {
      console.error("Supabase storage upload failed", uploadError);
      return NextResponse.json({ error: "Image storage is temporarily unavailable." }, { status: 503 });
    }

    const { data: urlData } = db.storage.from("spa-images").getPublicUrl(fileName);
    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      fileName,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: "Image upload failed. Please try again." },
      { status: 500 }
    );
  }
}
