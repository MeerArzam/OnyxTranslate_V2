// src/data/localization.ts — Per-language localization config (reconstructed).
// Consumed by translateContent/translateQueue/buildTranslationPrompt via
// getLocalizationConfig(langCode). Fields follow the salvaged prompt-builder
// contract exactly: name, nativeName, script, rtl, dialogue {open, close,
// note}, formality {system, informal, formal, note}, profanity, ranks,
// fanNames, magicSystem, styleSheet {register, sentenceLength, gender,
// archaic, numerals}, names.

export interface LocalizationConfig {
  name: string;
  nativeName: string;
  script: string;
  rtl: boolean;
  dialogue: { open: string; close: string; note: string };
  formality: { system: string; informal: string; formal: string; note: string };
  profanity: Record<string, string>;
  ranks: Record<string, string>;
  fanNames: Record<string, string>;
  magicSystem: string;
  styleSheet: {
    register: string;
    sentenceLength: string;
    gender: string;
    archaic: string;
    numerals: string;
  };
  names: Record<string, string>;
}

const latinStd = {
  register: "Modern literary fantasy; grounded narration, vivid action.",
  sentenceLength: "Vary; keep action lines short.",
  gender: "Natural grammatical gender; keep character voices distinct.",
  archaic: "Modern — avoid archaisms except in formal dragon speech.",
  numerals: "Western Arabic numerals",
};

export const LOCALIZATION: Record<string, LocalizationConfig> = {
  ur: {
    name: "Urdu", nativeName: "اردو", script: "Arabic", rtl: true,
    dialogue: { open: "\"", close: "\"", note: "Urdu full stop ۔ — NEVER the Latin period." },
    formality: { system: "Urdu adab register", informal: "تم", formal: "آپ", note: "Escalate to آپ in military/formal scenes." },
    profanity: { "damn": "لعنت", "hell": "جہنم" },
    ranks: { "Cadet": "کیڈٹ", "Commander": "کمانڈر", "General": "جنرل", "Squadron Leader": "اسکواڈرن لیڈر" },
    fanNames: {},
    magicSystem: "سائنٹ (Signet) powers channel through the dragon bond; wards block venin.",
    styleSheet: { register: "Poetic literary Urdu (Naskh prose register).", sentenceLength: "Flowing; keep dialogue crisp.", gender: "Grammatical gender via verbs; keep voices distinct.", archaic: "Light poetic archaisms allowed.", numerals: "Urdu numerals preferred" },
    names: { "Violet Sorrengail": "وایلیٹ سورینگیل", "Xaden Riorson": "زیدن ریورسن", "Tairn": "ٹارن", "Andarna": "اینڈارنا", "Ridoc": "رڈوک", "Dain": "ڈین", "Basgiath": "باسگیاتھ" },
  },
  ar: {
    name: "Arabic", nativeName: "العربية", script: "Arabic", rtl: true,
    dialogue: { open: "«", close: "»", note: "Guillemets with proper spacing; Arabic full stop." },
    formality: { system: "Classical/modern balance", informal: "أنتِ/أنت", formal: "حضرتك", note: "Use formal address in military settings." },
    profanity: { "damn": "تبًا", "hell": "الجحيم" },
    ranks: { "Cadet": "متدرب", "Commander": "قائد", "General": "جنرال" },
    fanNames: {},
    magicSystem: "الخاتم السحرى (Signet) powers flow through the dragon bond; الحواجز ward venin.",
    styleSheet: { register: "Fusha literary register; flowing narration.", sentenceLength: "Medium; dialogue direct.", gender: "Full gender morphology; voices distinct.", archaic: "Slight classical coloring permitted.", numerals: "Arabic-Indic numerals preferred" },
    names: { "Violet Sorrengail": "فايليت سورينجيل", "Xaden Riorson": "زادين ريورسون", "Tairn": "تيرن", "Andarna": "أندارنا", "Basgiath": "باسجياث" },
  },
  fr: {
    name: "French", nativeName: "Français", script: "Latin", rtl: false,
    dialogue: { open: "«", close: "»", note: "Non-breaking space inside guillemets; em-dash turns optional." },
    formality: { system: "T–V distinction", informal: "tu", formal: "vous", note: "Cadets use vous with superiors; bonds drop to tu." },
    profanity: { "damn": "maudite", "hell": "enfer", "merde": "merde" },
    ranks: { "Cadet": "cadet", "Commander": "commandant", "General": "général", "Colonel": "colonel" },
    fanNames: {},
    magicSystem: "Sceau (Signet) — étatiser/puiser the bond; wards against venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violet Sorrengail", "Xaden Riorson": "Xaden Riorson", "Tairn": "Tairn", "Andarna": "Andarna", "Navarre": "Navarre" },
  },
  ja: {
    name: "Japanese", nativeName: "日本語", script: "Japanese", rtl: false,
    dialogue: { open: "「", close: "」", note: "Nested quotes 『』; thoughts also in 「」." },
    formality: { system: "Keigo", informal: "タメ口", formal: "敬語", note: "Dragons speak 尊大語 (haughty archaic); cadets plain-form." },
    profanity: { "damn": "くそっ", "hell": "地獄" },
    ranks: { "Cadet": "候補生", "Commander": "隊長", "General": "将軍" },
    fanNames: { "Riorson": "リオルソン", "Sorrengail": "ソレンゲイル" },
    magicSystem: "シグネット (Signet) powers awaken via the dragon bond; ウォード seals venin.",
    styleSheet: { register: "Light-novel literary register.", sentenceLength: "Short; punchy action.", gender: "Gendered first-persons (私/僕/わし).", archaic: "Archaic for dragons only.", numerals: "Arabic numerals common" },
    names: { "Violet Sorrengail": "ヴァイオレット", "Xaden Riorson": "ザデン", "Tairn": "テアーン", "Andarna": "アンダーナ", "Basgiath": "バスギアス" },
  },
  es: {
    name: "Spanish", nativeName: "Español", script: "Latin", rtl: false,
    dialogue: { open: "—", close: "", note: "Em-dash speaker turns; « » optional." },
    formality: { system: "T–V", informal: "tú", formal: "usted", note: "usted in hierarchy; bond speech tú." },
    profanity: { "damn": "maldito", "hell": "infierno" },
    ranks: { "Cadet": "cadete", "Commander": "comandante", "General": "general" },
    fanNames: {},
    magicSystem: "sello (Signet); protecciones against venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violeta", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  hi: {
    name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Danda । optional sentence end." },
    formality: { system: "आप/तुम", informal: "तुम", formal: "आप", note: "Military scenes आप." },
    profanity: { "damn": "धत्", "hell": "नरक" },
    ranks: { "Cadet": "प्रशिक्षार्थी", "Commander": "कमांडर", "General": "जनरल" },
    fanNames: {},
    magicSystem: "साइनेट शक्तियाँ ड्रैगन-बंधन से; वार्ड वेनिन रोकते हैं।",
    styleSheet: { register: "Literary Hindi; vivid action.", sentenceLength: "Medium.", gender: "Full gender verbs; voices distinct.", archaic: "Minimal.", numerals: "Devanagari numerals acceptable" },
    names: { "Violet Sorrengail": "वायलेट सोरेंगेल", "Xaden Riorson": "ज़ेडेन रिओरसन", "Tairn": "टैर्न", "Andarna": "अंडार्ना", "Basgiath": "बासगियाथ" },
  },
  tr: {
    name: "Turkish", nativeName: "Türkçe", script: "Latin", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Standard punctuation; agglutination around names." },
    formality: { system: "sen/siz", informal: "sen", formal: "siz", note: "Superiors siz." },
    profanity: { "damn": "kahrolası", "hell": "cehennem" },
    ranks: { "Cadet": "aday", "Commander": "komutan", "General": "general" },
    fanNames: {},
    magicSystem: "Mühür (Signet); koruma büyüleri venin'e karşı.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violet", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  zh: {
    name: "Chinese", nativeName: "中文", script: "Chinese", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "「」 acceptable in traditional contexts; thoughts 「」." },
    formality: { system: "您/你", informal: "你", formal: "您", note: "Hierarchy uses 您。" },
    profanity: { "damn": "该死", "hell": "地狱" },
    ranks: { "Cadet": "学员", "Commander": "指挥官", "General": "将军" },
    fanNames: { "Sorrengail": "索伦盖尔", "Riorson": "里奥森" },
    magicSystem: "龙印 (Signet) 通过龙契；护障抵御毒裔。",
    styleSheet: { register: "Web-novel literary register.", sentenceLength: "Short, rhythmic.", gender: "No gender morphology; tone carries voice.", archaic: "None.", numerals: "Chinese numerals in prose" },
    names: { "Violet Sorrengail": "薇尔莉特", "Xaden Riorson": "泽登", "Tairn": "泰恩", "Andarna": "安达娜", "Basgiath": "巴斯吉亚斯" },
  },
  ru: {
    name: "Russian", nativeName: "Русский", script: "Cyrillic", rtl: false,
    dialogue: { open: "«", close: "»", note: "Guillemets; — dash speaker turns." },
    formality: { system: "ты/вы", informal: "ты", formal: "вы", note: "Superiors вы." },
    profanity: { "damn": "проклятье", "hell": "ад" },
    ranks: { "Cadet": "курсант", "Commander": "командир", "General": "генерал" },
    fanNames: { "Riorson": "Риорсон", "Sorrengail": "Сорренгейл" },
    magicSystem: "Знак (Signet) через драконью связь; охранны против венин.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Вайолет", "Xaden Riorson": "Зейден", "Tairn": "Тэрн", "Andarna": "Андарна", "Basgiath": "Басгиат" },
  },
  ko: {
    name: "Korean", nativeName: "한국어", script: "Hangul", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "「」 acceptable; thoughts 「」." },
    formality: { system: "반말/존댓말", informal: "반말", formal: "존댓말", note: "Hierarchy 존댓말; dragons archaic-formal." },
    profanity: { "damn": "젠장", "hell": "지옥" },
    ranks: { "Cadet": "후보생", "Commander": "대장", "General": "장군" },
    fanNames: { "Riorson": "리어슨" },
    magicSystem: "인장 (Signet) — 용의 유대를 통해 각성; 구사하다; 워드는 베닌을 막는다.",
    styleSheet: { register: "Modern webtoon-novel register.", sentenceLength: "Short.", gender: "Speech levels encode status.", archaic: "Dragons only.", numerals: "Arabic numerals common" },
    names: { "Violet Sorrengail": "바이올렛", "Xaden Riorson": "제이든", "Tairn": "테른", "Andarna": "안다르나", "Basgiath": "바스기아스" },
  },
  de: {
    name: "German", nativeName: "Deutsch", script: "Latin", rtl: false,
    dialogue: { open: "„", close: "“", note: "German quotes; em-dash interruptions." },
    formality: { system: "du/Sie", informal: "du", formal: "Sie", note: "Hierarchy Sie; bond du." },
    profanity: { "damn": "verdammt", "hell": "Hölle" },
    ranks: { "Cadet": "Kadett", "Commander": "Kommandant", "General": "General" },
    fanNames: {},
    magicSystem: "Wappen|Siegel (Signet) — handhaben/schöpfen über die Drachenbindung; Schutzwall gegen Venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violet", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna", "Basgiath": "Basgiath" },
  },
  ks: {
    name: "Kashmiri", nativeName: "کٲشُر", script: "Arabic", rtl: true,
    dialogue: { open: "\"", close: "\"", note: "Arabic-script punctuation; never Latin periods." },
    formality: { system: "Respect plural", informal: "تہٕ", formal: "تُمی", note: "Honorific plural common." },
    profanity: {},
    ranks: { "Cadet": "تربیت", "Commander": "کمانڈر" },
    fanNames: {},
    magicSystem: "سائنٹ طاقتِہ ڈریگن بونڈہ پؠٹھ؛ وارڈ وینین روکان۔",
    styleSheet: { register: "Literary Kashmiri (Perso-Arabic).", sentenceLength: "Medium.", gender: "Grammatical gender in verbs.", archaic: "Light.", numerals: "Arabic-Indic preferred" },
    names: { "Violet Sorrengail": "وایلیٹ", "Xaden Riorson": "زیدن", "Tairn": "ٹارن", "Andarna": "اینڈارنا" },
  },
  ro: {
    name: "Romanian", nativeName: "Română", script: "Latin", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Standard punctuation." },
    formality: { system: "tu/dumneavoastră", informal: "tu", formal: "dumneavoastră", note: "Superiors formal." },
    profanity: { "damn": "nah", "hell": "iad" },
    ranks: { "Cadet": "cadet", "Commander": "comandant", "General": "general" },
    fanNames: {},
    magicSystem: "Semnul (Signet); protecții contra venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violeta", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  sw: {
    name: "Swahili", nativeName: "Kiswahili", script: "Latin", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Standard punctuation." },
    formality: { system: "wewe/nyinyi", informal: "wewe", formal: "nyinyi", note: "Respect forms in hierarchy." },
    profanity: {},
    ranks: { "Cadet": "mwanafunzi", "Commander": "kamanda", "General": "jenerali" },
    fanNames: {},
    magicSystem: "Alama (Signet) kupitia kiungo cha jou; hifadhi dhidi ya venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violet", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  it: {
    name: "Italian", nativeName: "Italiano", script: "Latin", rtl: false,
    dialogue: { open: "«", close: "»", note: "Guillemets preferred." },
    formality: { system: "tu/Lei", informal: "tu", formal: "Lei", note: "Hierarchy Lei." },
    profanity: { "damn": "dannazione", "hell": "inferno" },
    ranks: { "Cadet": "cadetto", "Commander": "comandante", "General": "generale" },
    fanNames: {},
    magicSystem: "Sigillo (Signet); barriere contro i venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violet", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  la: {
    name: "Latin", nativeName: "Latina", script: "Latin", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Classical conventions; no modern punctuation innovation." },
    formality: { system: "Classical address", informal: "tū", formal: "vōs", note: "Vōs as respectful plural." },
    profanity: {},
    ranks: { "Cadet": "tiro", "Commander": "dux", "General": "imperator" },
    fanNames: {},
    magicSystem: "Signum (Signet) per vinculum draconis; vallum contra venin.",
    styleSheet: { register: "Classical narrative prose.", sentenceLength: "Long periodic sentences acceptable.", gender: "Full declension; voices via style.", archaic: "Inherently classical.", numerals: "Roman numerals for chapters" },
    names: { "Violet Sorrengail": "Violeta", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  id: {
    name: "Indonesian", nativeName: "Bahasa Indonesia", script: "Latin", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Standard punctuation." },
    formality: { system: "kamu/Anda", informal: "kamu", formal: "Anda", note: "Hierarchy Anda." },
    profanity: { "damn": "sial", "hell": "neraka" },
    ranks: { "Cadet": "taruna", "Commander": "komandan", "General": "jenderal" },
    fanNames: {},
    magicSystem: "Tanda (Signet) lewat ikatan naga; pelindung melawan venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violet", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
  ne: {
    name: "Nepali", nativeName: "नेपाली", script: "Devanagari", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Danda । natural sentence end." },
    formality: { system: "तँ/तपाईं", informal: "तँ", formal: "तपाईं", note: "तपाईं in hierarchy." },
    profanity: {},
    ranks: { "Cadet": "प्रशिक्षार्थी", "Commander": "कमाण्डर", "General": "जनरल" },
    fanNames: {},
    magicSystem: "साइनेट शक्ति ड्र्यागन-बन्धनबाट; वार्डले वेनिन रोक्छ।",
    styleSheet: { register: "Literary Nepali.", sentenceLength: "Medium.", gender: "Honorific tiers carry status.", archaic: "Minimal.", numerals: "Devanagari acceptable" },
    names: { "Violet Sorrengail": "वायलेट", "Xaden Riorson": "जेडेन", "Tairn": "टैर्न", "Andarna": "अन्डार्ना" },
  },
  bn: {
    name: "Bangla", nativeName: "বাংলা", script: "Bengali", rtl: false,
    dialogue: { open: "\"", close: "\"", note: "Daṛi । sentence end." },
    formality: { system: "তুই/আপনি", informal: "তুই", formal: "আপনি", note: "আপনি in hierarchy." },
    profanity: { "damn": "দাঁড়াও না", "hell": "নরক" },
    ranks: { "Cadet": "প্রশিক্ষণার্থী", "Commander": "কমান্ডার", "General": "জেনারেল" },
    fanNames: {},
    magicSystem: "সাইনেট শক্তি ড্রাগন-বন্ধন থেকে; ওয়ার্ড ভেনিন ঠেকায়।",
    styleSheet: { register: "Literary Bangla.", sentenceLength: "Medium.", gender: "Verb gender; voices distinct.", archaic: "Minimal.", numerals: "Bengali numerals preferred" },
    names: { "Violet Sorrengail": "ভায়োলেট", "Xaden Riorson": "জেডেন", "Tairn": "টেয়ার্ন", "Andarna": "আন্দার্না" },
  },
  pt: {
    name: "Portuguese", nativeName: "Português", script: "Latin", rtl: false,
    dialogue: { open: "—", close: "", note: "Em-dash turns; \" \" acceptable." },
    formality: { system: "tu/você", informal: "tu", formal: "você/o senhor", note: "Hierarchy formal." },
    profanity: { "damn": "droga", "hell": "inferno" },
    ranks: { "Cadet": "cadete", "Commander": "comandante", "General": "general" },
    fanNames: {},
    magicSystem: "Sinal (Signet); proteções contra venin.",
    styleSheet: latinStd,
    names: { "Violet Sorrengail": "Violeta", "Xaden Riorson": "Xaden", "Tairn": "Tairn", "Andarna": "Andarna" },
  },
};

export function getLocalizationConfig(langCode: string): LocalizationConfig | undefined {
  return LOCALIZATION[langCode];
}
