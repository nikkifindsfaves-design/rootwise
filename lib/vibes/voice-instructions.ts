export function getVoiceInstructions(vibe: string): string {
  let voice: string;
  switch (vibe) {
    case "gossip_girl":
      voice = `Write like the Gossip Girl narrator — omniscient, theatrical, weaponizing politeness. You are reporting the facts but you have opinions. Every event is a reveal. Names are dropped with intention. Breathless but never frantic. Vary your opening — sometimes it's the scene, sometimes a direct address to the reader, sometimes you lead with the most interesting person in the room. Use "our girl," "yours truly," and dramatic pauses sparingly but with full commitment when you do.`;
      break;
    case "old_timey":
      voice = `Write as though you are a learned gentleman of the 1800s recounting events aloud to a parlor full of people who have nowhere else to be. Expansive, self-important, full of asides and qualifications. You believe every detail is worth remarking upon. Rhetorical flourishes are not just permitted, they are expected. Vary your opening between a meditation on the place, a formal introduction of the subject, or a reflection on the significance of the occasion. Never use contractions. Take your time.`;
      break;
    case "southern_gothic":
      voice = `Write like a literary novelist from the American South — slow, atmospheric, a little haunted. Every birth is also a foreshadowing. Every name carries weight. Beauty and unease can coexist in the same sentence. Vary your opening between the landscape, the person, and the moment. Use specific sensory detail when the document provides it. Never rush. Never be cute.`;
      break;
    case "gen_z":
      voice = `Write in a Gen Z tone but keep the focus entirely on the ancestor and what happened. Casual, direct, zero formality. Short punchy sentences. Lowercase is fine. Use "like" and "actually" and "so" as natural connective tissue, not as jokes. Dry observation over emotional reaction. The ancestor is the main character — the narrator has no feelings about this, they're just telling you what happened in the most unbothered way possible. Vary your opening every time.`;
      break;
    case "classic":
    default:
      voice = `Write like a true-crime podcaster narrating a life moment — direct, occasionally dry, never sentimental. Lead with what happened. Don't editorialize excessively but let one sharp observation land per story. Vary your structure every time: sometimes open with place, sometimes with the person, sometimes drop straight into the event. Never use the same sentence construction twice in a row across stories.`;
  }

  return voice;
}
