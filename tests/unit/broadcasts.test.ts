import { describe, expect, it } from "vitest";

import { OPT_OUT_LINE, broadcastTemplateName, composeBroadcastBody, optKeyword, renderBroadcast } from "@/lib/broadcasts/compose";

describe("broadcast messages", () => {
  it("adds the greeting and the opt-out line; braces typed by the business are removed", () => {
    const body = composeBroadcastBody("  Nouveaux pagnes {{2}} arrivés !  ", "fr", true);
    expect(body).toBe(`Bonjour {{1}}, Nouveaux pagnes 2 arrivés !\n\n${OPT_OUT_LINE.fr}`);
    expect(renderBroadcast(body, "Brenda").startsWith("Bonjour Brenda, Nouveaux pagnes")).toBe(true);
    expect(composeBroadcastBody("New arrivals!", "en", false)).toBe(`New arrivals!\n\n${OPT_OUT_LINE.en}`);
  });

  it("uses a valid, unique Meta template name per broadcast", () => {
    expect(broadcastTemplateName("2f6c1e8a-1234-4abc-9def-001122334455")).toBe("wazabolt_bc_2f6c1e8a12344abc");
  });
});

describe("STOP / START keywords", () => {
  it("recognises the whole message, in English or French, any case or accents", () => {
    for (const t of ["STOP", "stop", " Stop! ", "Arrêt", "ARRETER", "stop promo", "Désabonner", "unsubscribe"]) expect(optKeyword(t)).toBe("stop");
    for (const t of ["START", "start", "S'abonner", "subscribe"]) expect(optKeyword(t)).toBe("start");
  });
  it("ignores normal sentences that contain the word", () => {
    for (const t of ["Please don't stop the delivery", "stop and start", "C'est quand l'arrêt du bus ?", "Bonjour"]) expect(optKeyword(t)).toBeNull();
  });
});
