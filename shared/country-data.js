// ═══════════════════════════════════════════════════════════
//  shared/country-data.js
//  Country dial-code + flag lookup tables, used by the Visa
//  Application phone-number field. Pulled out of script.js —
//  it's pure data (70 lines of a lookup table), not application
//  logic, and putting it in its own file makes script.js
//  readable as 'what the page DOES' without scrolling past a
//  giant country list first. Load this file before script.js.
// ═══════════════════════════════════════════════════════════

// ── 2. COUNTRY CODE MAP ───────────────────────────────────────────
const COUNTRY_CODES = {
  'Indian':      { dial: '+91',  flag: '🇮🇳', name: 'India' },
  'Bangladeshi': { dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  'Sri Lankan':  { dial: '+94',  flag: '🇱🇰', name: 'Sri Lanka' },
  'Nepali':      { dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  'Pakistani':   { dial: '+92',  flag: '🇵🇰', name: 'Pakistan' },
  'Afghan':      { dial: '+93',  flag: '🇦🇫', name: 'Afghanistan' },
  'Bhutanese':   { dial: '+975', flag: '🇧🇹', name: 'Bhutan' },
  'Maldivian':   { dial: '+960', flag: '🇲🇻', name: 'Maldives' },
};

const COUNTRY_LOOKUP = {
  'afghanistan':{'dial':'+93','flag':'🇦🇫'},'albania':{'dial':'+355','flag':'🇦🇱'},
  'algeria':{'dial':'+213','flag':'🇩🇿'},'angola':{'dial':'+244','flag':'🇦🇴'},
  'argentina':{'dial':'+54','flag':'🇦🇷'},'armenia':{'dial':'+374','flag':'🇦🇲'},
  'australia':{'dial':'+61','flag':'🇦🇺'},'austria':{'dial':'+43','flag':'🇦🇹'},
  'azerbaijan':{'dial':'+994','flag':'🇦🇿'},'bahrain':{'dial':'+973','flag':'🇧🇭'},
  'bangladesh':{'dial':'+880','flag':'🇧🇩'},'belarus':{'dial':'+375','flag':'🇧🇾'},
  'belgium':{'dial':'+32','flag':'🇧🇪'},'bolivia':{'dial':'+591','flag':'🇧🇴'},
  'brazil':{'dial':'+55','flag':'🇧🇷'},'bulgaria':{'dial':'+359','flag':'🇧🇬'},
  'cambodia':{'dial':'+855','flag':'🇰🇭'},'cameroon':{'dial':'+237','flag':'🇨🇲'},
  'canada':{'dial':'+1','flag':'🇨🇦'},'chile':{'dial':'+56','flag':'🇨🇱'},
  'china':{'dial':'+86','flag':'🇨🇳'},'colombia':{'dial':'+57','flag':'🇨🇴'},
  'croatia':{'dial':'+385','flag':'🇭🇷'},'cuba':{'dial':'+53','flag':'🇨🇺'},
  'cyprus':{'dial':'+357','flag':'🇨🇾'},'czech':{'dial':'+420','flag':'🇨🇿'},
  'denmark':{'dial':'+45','flag':'🇩🇰'},'egypt':{'dial':'+20','flag':'🇪🇬'},
  'ethiopia':{'dial':'+251','flag':'🇪🇹'},'finland':{'dial':'+358','flag':'🇫🇮'},
  'france':{'dial':'+33','flag':'🇫🇷'},'georgia':{'dial':'+995','flag':'🇬🇪'},
  'germany':{'dial':'+49','flag':'🇩🇪'},'ghana':{'dial':'+233','flag':'🇬🇭'},
  'greece':{'dial':'+30','flag':'🇬🇷'},'hungary':{'dial':'+36','flag':'🇭🇺'},
  'indonesia':{'dial':'+62','flag':'🇮🇩'},'iran':{'dial':'+98','flag':'🇮🇷'},
  'iraq':{'dial':'+964','flag':'🇮🇶'},'ireland':{'dial':'+353','flag':'🇮🇪'},
  'israel':{'dial':'+972','flag':'🇮🇱'},'italy':{'dial':'+39','flag':'🇮🇹'},
  'japan':{'dial':'+81','flag':'🇯🇵'},'jordan':{'dial':'+962','flag':'🇯🇴'},
  'kazakhstan':{'dial':'+7','flag':'🇰🇿'},'kenya':{'dial':'+254','flag':'🇰🇪'},
  'korea':{'dial':'+82','flag':'🇰🇷'},'south korea':{'dial':'+82','flag':'🇰🇷'},
  'kuwait':{'dial':'+965','flag':'🇰🇼'},'kyrgyzstan':{'dial':'+996','flag':'🇰🇬'},
  'laos':{'dial':'+856','flag':'🇱🇦'},'latvia':{'dial':'+371','flag':'🇱🇻'},
  'lebanon':{'dial':'+961','flag':'🇱🇧'},'libya':{'dial':'+218','flag':'🇱🇾'},
  'lithuania':{'dial':'+370','flag':'🇱🇹'},'malaysia':{'dial':'+60','flag':'🇲🇾'},
  'mexico':{'dial':'+52','flag':'🇲🇽'},'moldova':{'dial':'+373','flag':'🇲🇩'},
  'mongolia':{'dial':'+976','flag':'🇲🇳'},'morocco':{'dial':'+212','flag':'🇲🇦'},
  'mozambique':{'dial':'+258','flag':'🇲🇿'},'myanmar':{'dial':'+95','flag':'🇲🇲'},
  'nepal':{'dial':'+977','flag':'🇳🇵'},'netherlands':{'dial':'+31','flag':'🇳🇱'},
  'new zealand':{'dial':'+64','flag':'🇳🇿'},'nigeria':{'dial':'+234','flag':'🇳🇬'},
  'norway':{'dial':'+47','flag':'🇳🇴'},'oman':{'dial':'+968','flag':'🇴🇲'},
  'pakistan':{'dial':'+92','flag':'🇵🇰'},'palestine':{'dial':'+970','flag':'🇵🇸'},
  'peru':{'dial':'+51','flag':'🇵🇪'},'philippines':{'dial':'+63','flag':'🇵🇭'},
  'poland':{'dial':'+48','flag':'🇵🇱'},'portugal':{'dial':'+351','flag':'🇵🇹'},
  'qatar':{'dial':'+974','flag':'🇶🇦'},'romania':{'dial':'+40','flag':'🇷🇴'},
  'russia':{'dial':'+7','flag':'🇷🇺'},'saudi':{'dial':'+966','flag':'🇸🇦'},
  'saudi arabia':{'dial':'+966','flag':'🇸🇦'},'senegal':{'dial':'+221','flag':'🇸🇳'},
  'serbia':{'dial':'+381','flag':'🇷🇸'},'singapore':{'dial':'+65','flag':'🇸🇬'},
  'slovakia':{'dial':'+421','flag':'🇸🇰'},'somalia':{'dial':'+252','flag':'🇸🇴'},
  'south africa':{'dial':'+27','flag':'🇿🇦'},'spain':{'dial':'+34','flag':'🇪🇸'},
  'sri lanka':{'dial':'+94','flag':'🇱🇰'},'sudan':{'dial':'+249','flag':'🇸🇩'},
  'sweden':{'dial':'+46','flag':'🇸🇪'},'switzerland':{'dial':'+41','flag':'🇨🇭'},
  'syria':{'dial':'+963','flag':'🇸🇾'},'taiwan':{'dial':'+886','flag':'🇹🇼'},
  'tajikistan':{'dial':'+992','flag':'🇹🇯'},'tanzania':{'dial':'+255','flag':'🇹🇿'},
  'thailand':{'dial':'+66','flag':'🇹🇭'},'tunisia':{'dial':'+216','flag':'🇹🇳'},
  'turkey':{'dial':'+90','flag':'🇹🇷'},'turkmenistan':{'dial':'+993','flag':'🇹🇲'},
  'uganda':{'dial':'+256','flag':'🇺🇬'},'ukraine':{'dial':'+380','flag':'🇺🇦'},
  'uae':{'dial':'+971','flag':'🇦🇪'},'united arab emirates':{'dial':'+971','flag':'🇦🇪'},
  'uk':{'dial':'+44','flag':'🇬🇧'},'united kingdom':{'dial':'+44','flag':'🇬🇧'},
  'usa':{'dial':'+1','flag':'🇺🇸'},'united states':{'dial':'+1','flag':'🇺🇸'},
  'uzbekistan':{'dial':'+998','flag':'🇺🇿'},'venezuela':{'dial':'+58','flag':'🇻🇪'},
  'vietnam':{'dial':'+84','flag':'🇻🇳'},'yemen':{'dial':'+967','flag':'🇾🇪'},
  'zambia':{'dial':'+260','flag':'🇿🇲'},'zimbabwe':{'dial':'+263','flag':'🇿🇼'},
};
