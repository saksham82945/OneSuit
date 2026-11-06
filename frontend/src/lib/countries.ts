// Countries and their international dialling codes, for phone inputs.
// India comes first (and is the default); the rest are alphabetical.

export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. "IN". */
  iso: string;
  name: string;
  /** Dialling code without "+", e.g. "91". */
  dial: string;
  /** Exact national number lengths, when the country uses fixed lengths. */
  lengths?: number[];
}

const RAW: [iso: string, name: string, dial: string, lengths?: number[]][] = [
  ['AF', 'Afghanistan', '93', [9]],
  ['AL', 'Albania', '355'],
  ['DZ', 'Algeria', '213', [9]],
  ['AS', 'American Samoa', '1'],
  ['AD', 'Andorra', '376'],
  ['AO', 'Angola', '244', [9]],
  ['AI', 'Anguilla', '1'],
  ['AG', 'Antigua and Barbuda', '1'],
  ['AR', 'Argentina', '54'],
  ['AM', 'Armenia', '374', [8]],
  ['AW', 'Aruba', '297', [7]],
  ['AU', 'Australia', '61', [9]],
  ['AT', 'Austria', '43'],
  ['AZ', 'Azerbaijan', '994', [9]],
  ['BS', 'Bahamas', '1'],
  ['BH', 'Bahrain', '973', [8]],
  ['BD', 'Bangladesh', '880', [10]],
  ['BB', 'Barbados', '1'],
  ['BY', 'Belarus', '375', [9]],
  ['BE', 'Belgium', '32', [8, 9]],
  ['BZ', 'Belize', '501', [7]],
  ['BJ', 'Benin', '229'],
  ['BM', 'Bermuda', '1'],
  ['BT', 'Bhutan', '975', [7, 8]],
  ['BO', 'Bolivia', '591', [8]],
  ['BA', 'Bosnia and Herzegovina', '387'],
  ['BW', 'Botswana', '267'],
  ['BR', 'Brazil', '55', [10, 11]],
  ['BN', 'Brunei', '673', [7]],
  ['BG', 'Bulgaria', '359'],
  ['BF', 'Burkina Faso', '226', [8]],
  ['BI', 'Burundi', '257', [8]],
  ['KH', 'Cambodia', '855'],
  ['CM', 'Cameroon', '237', [9]],
  ['CA', 'Canada', '1', [10]],
  ['CV', 'Cape Verde', '238', [7]],
  ['KY', 'Cayman Islands', '1'],
  ['CF', 'Central African Republic', '236', [8]],
  ['TD', 'Chad', '235', [8]],
  ['CL', 'Chile', '56', [9]],
  ['CN', 'China', '86', [11]],
  ['CO', 'Colombia', '57', [10]],
  ['KM', 'Comoros', '269', [7]],
  ['CG', 'Congo', '242', [9]],
  ['CD', 'Congo (DRC)', '243', [9]],
  ['CR', 'Costa Rica', '506', [8]],
  ['CI', "Côte d'Ivoire", '225', [10]],
  ['HR', 'Croatia', '385'],
  ['CU', 'Cuba', '53'],
  ['CY', 'Cyprus', '357', [8]],
  ['CZ', 'Czechia', '420', [9]],
  ['DK', 'Denmark', '45', [8]],
  ['DJ', 'Djibouti', '253', [8]],
  ['DM', 'Dominica', '1'],
  ['DO', 'Dominican Republic', '1'],
  ['EC', 'Ecuador', '593'],
  ['EG', 'Egypt', '20', [10]],
  ['SV', 'El Salvador', '503', [8]],
  ['GQ', 'Equatorial Guinea', '240', [9]],
  ['ER', 'Eritrea', '291', [7]],
  ['EE', 'Estonia', '372'],
  ['SZ', 'Eswatini', '268', [8]],
  ['ET', 'Ethiopia', '251', [9]],
  ['FJ', 'Fiji', '679', [7]],
  ['FI', 'Finland', '358'],
  ['FR', 'France', '33', [9]],
  ['GF', 'French Guiana', '594', [9]],
  ['PF', 'French Polynesia', '689'],
  ['GA', 'Gabon', '241'],
  ['GM', 'Gambia', '220', [7]],
  ['GE', 'Georgia', '995', [9]],
  ['DE', 'Germany', '49'],
  ['GH', 'Ghana', '233', [9]],
  ['GI', 'Gibraltar', '350', [8]],
  ['GR', 'Greece', '30', [10]],
  ['GL', 'Greenland', '299', [6]],
  ['GD', 'Grenada', '1'],
  ['GP', 'Guadeloupe', '590', [9]],
  ['GU', 'Guam', '1'],
  ['GT', 'Guatemala', '502', [8]],
  ['GN', 'Guinea', '224', [9]],
  ['GW', 'Guinea-Bissau', '245'],
  ['GY', 'Guyana', '592', [7]],
  ['HT', 'Haiti', '509', [8]],
  ['HN', 'Honduras', '504', [8]],
  ['HK', 'Hong Kong', '852', [8]],
  ['HU', 'Hungary', '36', [8, 9]],
  ['IS', 'Iceland', '354', [7]],
  ['ID', 'Indonesia', '62'],
  ['IR', 'Iran', '98', [10]],
  ['IQ', 'Iraq', '964', [10]],
  ['IE', 'Ireland', '353'],
  ['IL', 'Israel', '972', [8, 9]],
  ['IT', 'Italy', '39'],
  ['JM', 'Jamaica', '1'],
  ['JP', 'Japan', '81', [9, 10]],
  ['JO', 'Jordan', '962', [8, 9]],
  ['KZ', 'Kazakhstan', '7', [10]],
  ['KE', 'Kenya', '254', [9]],
  ['KI', 'Kiribati', '686'],
  ['XK', 'Kosovo', '383'],
  ['KW', 'Kuwait', '965', [8]],
  ['KG', 'Kyrgyzstan', '996', [9]],
  ['LA', 'Laos', '856'],
  ['LV', 'Latvia', '371', [8]],
  ['LB', 'Lebanon', '961', [7, 8]],
  ['LS', 'Lesotho', '266', [8]],
  ['LR', 'Liberia', '231'],
  ['LY', 'Libya', '218', [9]],
  ['LI', 'Liechtenstein', '423'],
  ['LT', 'Lithuania', '370', [8]],
  ['LU', 'Luxembourg', '352'],
  ['MO', 'Macao', '853', [8]],
  ['MG', 'Madagascar', '261', [9]],
  ['MW', 'Malawi', '265'],
  ['MY', 'Malaysia', '60', [9, 10]],
  ['MV', 'Maldives', '960', [7]],
  ['ML', 'Mali', '223', [8]],
  ['MT', 'Malta', '356', [8]],
  ['MH', 'Marshall Islands', '692', [7]],
  ['MQ', 'Martinique', '596', [9]],
  ['MR', 'Mauritania', '222', [8]],
  ['MU', 'Mauritius', '230', [7, 8]],
  ['YT', 'Mayotte', '262', [9]],
  ['MX', 'Mexico', '52', [10]],
  ['FM', 'Micronesia', '691', [7]],
  ['MD', 'Moldova', '373', [8]],
  ['MC', 'Monaco', '377'],
  ['MN', 'Mongolia', '976', [8]],
  ['ME', 'Montenegro', '382'],
  ['MS', 'Montserrat', '1'],
  ['MA', 'Morocco', '212', [9]],
  ['MZ', 'Mozambique', '258', [9]],
  ['MM', 'Myanmar', '95'],
  ['NA', 'Namibia', '264'],
  ['NR', 'Nauru', '674'],
  ['NP', 'Nepal', '977', [10]],
  ['NL', 'Netherlands', '31', [9]],
  ['NC', 'New Caledonia', '687', [6]],
  ['NZ', 'New Zealand', '64'],
  ['NI', 'Nicaragua', '505', [8]],
  ['NE', 'Niger', '227', [8]],
  ['NG', 'Nigeria', '234', [10]],
  ['KP', 'North Korea', '850'],
  ['MK', 'North Macedonia', '389', [8]],
  ['MP', 'Northern Mariana Islands', '1'],
  ['NO', 'Norway', '47', [8]],
  ['OM', 'Oman', '968', [8]],
  ['PK', 'Pakistan', '92', [10]],
  ['PW', 'Palau', '680', [7]],
  ['PS', 'Palestine', '970', [9]],
  ['PA', 'Panama', '507', [7, 8]],
  ['PG', 'Papua New Guinea', '675'],
  ['PY', 'Paraguay', '595', [9]],
  ['PE', 'Peru', '51', [9]],
  ['PH', 'Philippines', '63', [10]],
  ['PL', 'Poland', '48', [9]],
  ['PT', 'Portugal', '351', [9]],
  ['PR', 'Puerto Rico', '1'],
  ['QA', 'Qatar', '974', [8]],
  ['RE', 'Réunion', '262', [9]],
  ['RO', 'Romania', '40', [9]],
  ['RU', 'Russia', '7', [10]],
  ['RW', 'Rwanda', '250', [9]],
  ['KN', 'Saint Kitts and Nevis', '1'],
  ['LC', 'Saint Lucia', '1'],
  ['VC', 'Saint Vincent and the Grenadines', '1'],
  ['WS', 'Samoa', '685'],
  ['SM', 'San Marino', '378'],
  ['ST', 'São Tomé and Príncipe', '239', [7]],
  ['SA', 'Saudi Arabia', '966', [9]],
  ['SN', 'Senegal', '221', [9]],
  ['RS', 'Serbia', '381'],
  ['SC', 'Seychelles', '248', [7]],
  ['SL', 'Sierra Leone', '232', [8]],
  ['SG', 'Singapore', '65', [8]],
  ['SK', 'Slovakia', '421', [9]],
  ['SI', 'Slovenia', '386', [8]],
  ['SB', 'Solomon Islands', '677'],
  ['SO', 'Somalia', '252'],
  ['ZA', 'South Africa', '27', [9]],
  ['KR', 'South Korea', '82', [9, 10]],
  ['SS', 'South Sudan', '211', [9]],
  ['ES', 'Spain', '34', [9]],
  ['LK', 'Sri Lanka', '94', [9]],
  ['SD', 'Sudan', '249', [9]],
  ['SR', 'Suriname', '597'],
  ['SE', 'Sweden', '46'],
  ['CH', 'Switzerland', '41', [9]],
  ['SY', 'Syria', '963', [9]],
  ['TW', 'Taiwan', '886', [9]],
  ['TJ', 'Tajikistan', '992', [9]],
  ['TZ', 'Tanzania', '255', [9]],
  ['TH', 'Thailand', '66', [9]],
  ['TL', 'Timor-Leste', '670'],
  ['TG', 'Togo', '228', [8]],
  ['TO', 'Tonga', '676'],
  ['TT', 'Trinidad and Tobago', '1'],
  ['TN', 'Tunisia', '216', [8]],
  ['TR', 'Türkiye', '90', [10]],
  ['TM', 'Turkmenistan', '993', [8]],
  ['TC', 'Turks and Caicos Islands', '1'],
  ['TV', 'Tuvalu', '688'],
  ['UG', 'Uganda', '256', [9]],
  ['UA', 'Ukraine', '380', [9]],
  ['AE', 'United Arab Emirates', '971', [8, 9]],
  ['GB', 'United Kingdom', '44', [10]],
  ['US', 'United States', '1', [10]],
  ['UY', 'Uruguay', '598'],
  ['VI', 'U.S. Virgin Islands', '1'],
  ['UZ', 'Uzbekistan', '998', [9]],
  ['VU', 'Vanuatu', '678'],
  ['VA', 'Vatican City', '39'],
  ['VE', 'Venezuela', '58', [10]],
  ['VN', 'Vietnam', '84', [9, 10]],
  ['VG', 'British Virgin Islands', '1'],
  ['YE', 'Yemen', '967', [9]],
  ['ZM', 'Zambia', '260', [9]],
  ['ZW', 'Zimbabwe', '263', [9]],
];

export const INDIA: Country = { iso: 'IN', name: 'India', dial: '91', lengths: [10] };

/** India first, then everything else A–Z. */
export const COUNTRIES: Country[] = [
  INDIA,
  ...RAW.map(([iso, name, dial, lengths]) => ({ iso, name, dial, lengths })).sort((a, b) =>
    a.name.localeCompare(b.name)
  ),
];

export const DEFAULT_COUNTRY = INDIA;

/** Flag emoji built from the two-letter ISO code. */
export function flagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export function findCountry(iso: string): Country {
  return COUNTRIES.find((c) => c.iso === iso) ?? DEFAULT_COUNTRY;
}

/** Digits only. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Checks a national number (no country code) for the country.
 * Returns an error message, or null when it looks right.
 */
export function phoneError(country: Country, national: string): string | null {
  const digits = phoneDigits(national).replace(/^0+/, '');
  if (!digits) return 'Enter your phone number';
  if (country.lengths && !country.lengths.includes(digits.length)) {
    const want = country.lengths.join(' or ');
    return `${country.name} numbers have ${want} digits`;
  }
  if (digits.length < 4 || digits.length + country.dial.length > 15) return 'Enter a valid phone number';
  if (country.iso === 'IN' && !/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6, 7, 8 or 9';
  return null;
}

/** "+<dial><national digits>", e.g. "+919876543210" (leading trunk zeros dropped). */
export function toE164(country: Country, national: string): string {
  return `+${country.dial}${phoneDigits(national).replace(/^0+/, '')}`;
}
