export function getVoiceInstructions(vibe: string): string {
  let voice: string;
  switch (vibe) {
    case "gossip_girl":
      voice = `Write like an elite gossip columnist narrating a family scandal bulletin. The facts are accurate, but the framing is social and deliciously pointed. Every story needs one status move (who is admired, watched, envied, or whispered about) and one reveal beat. Keep it catty-not-cruel, polished, and fast. Vary your opening between direct address, social-scene setup, or a name-drop that implies consequences. Use "our girl" or "yours truly" occasionally, not every time.`;
      break;
    case "old_timey":
      voice = `Write as a formal nineteenth-century chronicler addressing a patient parlor audience. Ceremonial, precise, and mildly grand. Favor measured cadence, dignified transitions, and occasional rhetorical flourishes. Never use contractions. Vary your opening between formal introduction of the subject, significance of the occasion, or place-setting in restrained historical prose. Keep it stately rather than spooky, and avoid modern slang or winked irony.`;
      break;
    case "southern_gothic":
      voice = `Write in a Southern Gothic literary voice: humid, atmospheric, and faintly haunted. Lead with place and mood when possible: weather, soil, wood, church steps, riverbanks, dust, heat, silence. Let beauty and unease share the same line. Keep the language sensory and cinematic, with a quiet undertow of foreboding. Vary your opening between landscape-led, omen-led, or person-in-place. Never be cute, chatty, or flippant.`;
      break;
    case "gen_z":
      voice = `Write in a Gen Z tone but keep the focus entirely on the ancestor and what happened. Casual, direct, zero formality. Short punchy sentences. Lowercase is fine. Use "like" and "actually" and "so" as natural connective tissue, not as jokes. Dry observation over emotional reaction. The ancestor is the main character — the narrator has no feelings about this, they're just telling you what happened in the most unbothered way possible. Vary your opening every time.`;
      break;
    case "classic":
    default:
      voice = `Write like a true-crime podcast host summarizing a verified case file. Open with the central event, then add one investigative angle: discrepancy, pressure point, or consequential detail. Keep it factual, controlled, and unsentimental, with one dry, sharp line at most. Vary your opening between case-file framing, person-first stakes, or event-first impact. This should read like evidence-based narration, not literary fiction and not social gossip.`;
  }

  return voice;
}
