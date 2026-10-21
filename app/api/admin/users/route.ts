import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
    }
    if (!admin.isSuperAdmin) {
      return NextResponse.json({
        admins: [],
        current_user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          isSuperAdmin: admin.isSuperAdmin,
        },
      });
    }

    const db = adminSupabase();
    const { data: adminRows, error: adminErr } = await db
      .from("admin_users")
      .select("id,user_id,created_at,role");

    if (adminErr) throw adminErr;

    const { data: { users }, error: authErr } = await db.auth.admin.listUsers();
    if (authErr) throw authErr;

    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = (adminRows || []).map((row) => {
      const authUser = userMap.get(row.user_id);
      const role = row.role === "super_admin" ? "super_admin" : "admin";

      return {
        id: row.id,
        user_id: row.user_id,
        email: authUser?.email || "Staff User",
        role,
        is_super_admin: role === "super_admin",
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      admins: result,
      current_user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        isSuperAdmin: admin.isSuperAdmin,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/users failed:", error);
    return NextResponse.json({ error: error.message || "Failed to load admin users." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
    }

    if (!admin.isSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admins can create new admins." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : "super_admin";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }
    if (password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Password must be between 12 and 128 characters." }, { status: 400 });
    }

    const db = adminSupabase();

    // Create an authenticated account, then assign its server-controlled database role.
    const { data: userResult, error: createError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !userResult.user) {
      return NextResponse.json({ error: createError?.message || "Failed to create user in authentication system." }, { status: 400 });
    }

    const { data: adminRow, error: insertError } = await db
      .from("admin_users")
      .insert({ user_id: userResult.user.id, role })
      .select("id,user_id,created_at,role")
      .single();

    if (insertError) {
      // rollback auth user
      await db.auth.admin.deleteUser(userResult.user.id);
      return NextResponse.json({ error: insertError.message || "Failed to grant staff role." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: adminRow.id,
        user_id: userResult.user.id,
        email,
        role,
        is_super_admin: role === "super_admin",
        created_at: adminRow.created_at,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/admin/users failed:", error);
    return NextResponse.json({ error: error.message || "Failed to create staff admin." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin || !admin.isSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admins can modify staff roles." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    const userId = body.user_id;
    if (body.role !== "admin" && body.role !== "super_admin") {
      return NextResponse.json({ error: "role must be admin or super_admin." }, { status: 400 });
    }
    const newRole = body.role;

    if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: "A valid user_id is required." }, { status: 400 });
    }

    const db = adminSupabase();
    const { data: target, error: targetError } = await db.from("admin_users")
      .select("id,role")
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    if (target.role === "super_admin" && newRole !== "super_admin") {
      const { count, error: countError } = await db.from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "You cannot demote the last Super Admin." }, { status: 400 });
      }
    }
    const { error } = await db.from("admin_users").update({ role: newRole }).eq("id", target.id);
    if (error) throw error;

    return NextResponse.json({ success: true, user_id: userId, role: newRole });
  } catch (error: any) {
    console.error("PATCH /api/admin/users failed:", error);
    return NextResponse.json({ error: error.message || "Failed to update role." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin || !admin.isSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admins can remove staff accounts." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const adminId = searchParams.get("admin_id");

    if ((!userId && !adminId)
      || (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
      || (adminId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId))) {
      return NextResponse.json({ error: "A valid user_id or admin_id is required." }, { status: 400 });
    }

    const db = adminSupabase();
    const targetQuery = db.from("admin_users").select("id,user_id,role");
    const { data: target, error: targetError } = userId
      ? await targetQuery.eq("user_id", userId).maybeSingle()
      : await targetQuery.eq("id", adminId!).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    if (target.user_id === admin.id) {
      return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
    }

    if (target.role === "super_admin") {
      const { count, error: countError } = await db.from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "You cannot remove the last Super Admin." }, { status: 400 });
      }
    }

    const { error: deleteError } = await db.from("admin_users").delete().eq("id", target.id);
    if (deleteError) throw deleteError;
    const { error: authDeleteError } = await db.auth.admin.deleteUser(target.user_id);
    if (authDeleteError) throw authDeleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/admin/users failed:", error);
    return NextResponse.json({ error: error.message || "Failed to remove admin." }, { status: 500 });
  }
}
