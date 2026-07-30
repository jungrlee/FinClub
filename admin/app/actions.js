"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../lib/requireAdmin";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export async function createCompetition(formData) {
  await requireAdmin(); // re-checked here, not just at the page level

  const name = formData.get("name")?.toString().trim();
  const starting_cash = parseFloat(formData.get("starting_cash"));
  const start_date = formData.get("start_date")?.toString();
  const end_date = formData.get("end_date")?.toString();
  const allow_short = formData.get("allow_short") === "on";

  if (!name || !(starting_cash > 0) || !start_date || !end_date) {
    throw new Error("all fields are required");
  }

  const { error } = await supabaseAdmin
    .from("competitions")
    .insert({ name, starting_cash, start_date, end_date, allow_short });
  if (error) throw new Error(error.message);

  revalidatePath("/");
}

export async function adjustCash(formData) {
  await requireAdmin();

  const participant_id = formData.get("participant_id")?.toString();
  const delta = parseFloat(formData.get("delta"));
  const competitionId = formData.get("competition_id")?.toString();
  if (!participant_id || !isFinite(delta) || delta === 0) {
    throw new Error("participant and a nonzero amount are required");
  }

  const { error } = await supabaseAdmin.rpc("admin_adjust_cash", {
    p_participant_id: participant_id,
    p_delta: delta,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/competitions/${competitionId}`);
}
