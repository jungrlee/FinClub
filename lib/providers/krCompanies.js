// Static fallback for Korean company name search. Yahoo is the only source
// with KR name search at all (KIS only accepts 6-digit codes), and it's
// the most rate-limit-fragile dependency in this whole stack — this
// curated list of well-known KOSPI/KOSDAQ names means common searches
// ("samsung", "카카오") work reliably without touching Yahoo at all.
// Not exhaustive — obscure tickers still fall through to Yahoo search.
export const KR_COMPANIES = [
  { code: "005930", en: "Samsung Electronics", ko: "삼성전자" },
  { code: "000660", en: "SK Hynix", ko: "SK하이닉스" },
  { code: "373220", en: "LG Energy Solution", ko: "LG에너지솔루션" },
  { code: "207940", en: "Samsung Biologics", ko: "삼성바이오로직스" },
  { code: "005380", en: "Hyundai Motor", ko: "현대차" },
  { code: "000270", en: "Kia", ko: "기아" },
  { code: "035420", en: "NAVER", ko: "네이버" },
  { code: "035720", en: "Kakao", ko: "카카오" },
  { code: "005490", en: "POSCO Holdings", ko: "POSCO홀딩스" },
  { code: "051910", en: "LG Chem", ko: "LG화학" },
  { code: "006400", en: "Samsung SDI", ko: "삼성SDI" },
  { code: "068270", en: "Celltrion", ko: "셀트리온" },
  { code: "105560", en: "KB Financial Group", ko: "KB금융" },
  { code: "055550", en: "Shinhan Financial Group", ko: "신한지주" },
  { code: "086790", en: "Hana Financial Group", ko: "하나금융지주" },
  { code: "012330", en: "Hyundai Mobis", ko: "현대모비스" },
  { code: "066570", en: "LG Electronics", ko: "LG전자" },
  { code: "096770", en: "SK Innovation", ko: "SK이노베이션" },
  { code: "323410", en: "Kakao Bank", ko: "카카오뱅크" },
  { code: "329180", en: "HD Hyundai Heavy Industries", ko: "HD현대중공업" },
  { code: "009830", en: "Hanwha Solutions", ko: "한화솔루션" },
  { code: "032830", en: "Samsung Life Insurance", ko: "삼성생명" },
  { code: "000810", en: "Samsung Fire & Marine Insurance", ko: "삼성화재" },
  { code: "034220", en: "LG Display", ko: "LG디스플레이" },
  { code: "017670", en: "SK Telecom", ko: "SK텔레콤" },
  { code: "030200", en: "KT Corp", ko: "KT" },
  { code: "010950", en: "S-Oil", ko: "S-Oil" },
  { code: "011170", en: "Lotte Chemical", ko: "롯데케미칼" },
  { code: "097950", en: "CJ CheilJedang", ko: "CJ제일제당" },
  { code: "090430", en: "Amorepacific", ko: "아모레퍼시픽" },
  { code: "051900", en: "LG Household & Health Care", ko: "LG생활건강" },
  { code: "034020", en: "Doosan Enerbility", ko: "두산에너빌리티" },
  { code: "011200", en: "HMM", ko: "HMM" },
  { code: "003490", en: "Korean Air", ko: "대한항공" },
  { code: "316140", en: "Woori Financial Group", ko: "우리금융지주" },
  { code: "138040", en: "Meritz Financial Group", ko: "메리츠금융지주" },
  { code: "251270", en: "Netmarble", ko: "넷마블" },
  { code: "259960", en: "Krafton", ko: "크래프톤" },
  { code: "036570", en: "NCSOFT", ko: "엔씨소프트" },
  { code: "112040", en: "Wemade", ko: "위메이드" },
  { code: "263750", en: "Pearl Abyss", ko: "펄어비스" },
  { code: "326030", en: "SK Biopharmaceuticals", ko: "SK바이오팜" },
  { code: "028260", en: "Samsung C&T", ko: "삼성물산" },
  { code: "000720", en: "Hyundai Engineering & Construction", ko: "현대건설" },
  { code: "375500", en: "DL E&C", ko: "DL이앤씨" },
  { code: "007070", en: "GS Retail", ko: "GS리테일" },
  { code: "004170", en: "Shinsegae", ko: "신세계" },
  { code: "023530", en: "Lotte Shopping", ko: "롯데쇼핑" },
  { code: "139480", en: "E-Mart", ko: "이마트" },
  { code: "069960", en: "Hyundai Department Store", ko: "현대백화점" },
  { code: "293490", en: "Kakao Games", ko: "카카오게임즈" },
  { code: "377300", en: "Kakao Pay", ko: "카카오페이" },
  { code: "352820", en: "HYBE", ko: "하이브" },
  { code: "035760", en: "CJ ENM", ko: "CJENM" },
  { code: "018260", en: "Samsung SDS", ko: "삼성에스디에스" },
  { code: "010130", en: "Korea Zinc", ko: "고려아연" },
  { code: "047810", en: "Korea Aerospace Industries", ko: "한국항공우주" },
  { code: "064350", en: "Hyundai Rotem", ko: "현대로템" },
  { code: "010140", en: "Samsung Heavy Industries", ko: "삼성중공업" },
  { code: "042660", en: "Hanwha Ocean", ko: "한화오션" },
  { code: "071050", en: "Korea Investment Holdings", ko: "한국금융지주" },
  { code: "016360", en: "Samsung Securities", ko: "삼성증권" },
  { code: "088350", en: "Hanwha Life", ko: "한화생명" },
  { code: "024110", en: "IBK", ko: "기업은행" },
  { code: "015760", en: "KEPCO", ko: "한국전력" },
];

export function searchKRStatic(q) {
  const query = q.trim().toLowerCase();
  const raw = q.trim();
  if (!query) return [];
  const scored = KR_COMPANIES.map((c) => {
    const en = c.en.toLowerCase();
    let score = -1;
    if (en === query || c.ko === raw || c.code === raw) score = 3;
    else if (en.startsWith(query) || c.ko.startsWith(raw)) score = 2;
    else if (en.includes(query) || c.ko.includes(raw)) score = 1;
    return { c, score };
  }).filter((x) => x.score >= 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map(({ c }) => ({ symbol: c.code, name: `${c.en} (${c.ko})` }));
}
