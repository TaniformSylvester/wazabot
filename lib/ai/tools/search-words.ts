/*
 * Words worth searching the catalog for, from a customer's message: lower
 * case, accents kept, punctuation dropped, and the everyday words of English,
 * French and Pidgin removed ("c'est combien la…", "how much for the…",
 * "una get…") so they don't match every product.
 */

const STOPWORDS = new Set(
  [
    // French
    "le la les un une des de du au aux en et ou à a ce cet cette ces c est c'est se sa son ses mon ma mes ton ta tes vos votre notre nos",
    "je tu il elle on nous vous ils elles me te moi toi lui leur y qui que quoi quel quelle quels quelles dont où ou si pas ne plus moins très tres",
    "pour par sur sous avec sans dans chez entre vers comme mais donc car est sont être etre avoir avez avons ai as a-t-il est-ce qu qu'il",
    "bonjour bonsoir salut coucou merci svp stp sil plait s'il oui non ok okay d'accord daccord svp",
    "combien prix coûte coute coûtent coutent tarif montant disponible dispo encore reste avez-vous vous-avez veux voudrais voulais besoin cherche",
    // English
    "the a an is are was be do does did you your yours have has had i i'm im me my we our us it its it's this that these those there here",
    "for of to in on at by from with and or but not no yes so if how what which who when where why can could would will please pls plz",
    "hi hello hey good morning afternoon evening night thanks thank much many price cost costs available still left want need looking any some",
    // Cameroonian Pidgin
    "na di dey wey fit e don go come get una wetin abeg make weti sef oh o ooh how far",
  ]
    .join(" ")
    .split(/\s+/),
);

export function searchWords(text: string, max = 6): string[] {
  const words = text
    .toLowerCase()
    .replace(/[%_,.()*\\"!?:;/[\]{}<>+=|~^$#@&]/g, " ")
    .replace(/\b(\w+)'/g, "$1 ") // "l'ankara" → "l ankara"
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, max);
}
