const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function convertHundreds(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    parts.push(ones ? `${tens}-${ONES[ones]}` : tens);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  const value = Math.floor(Math.abs(n));
  if (value === 0) return "Zero";

  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const words = groups
    .map((group, idx) => (group === 0 ? "" : `${convertHundreds(group)}${SCALES[idx] ? ` ${SCALES[idx]}` : ""}`))
    .filter(Boolean)
    .reverse();

  return words.join(" ");
}

export function amountInWords(amount: number, currency: string = "USD"): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const whole = Math.floor(rounded);
  const cents = Math.round((rounded - whole) * 100);
  const wholeWords = numberToWords(whole);

  return cents === 0
    ? `${currency} ${wholeWords} Only.`
    : `${currency} ${wholeWords} and ${numberToWords(cents)} Cents Only.`;
}
