export interface PaymentInfo {
  amount: number;
  currency: string;
  paypalUrl: string | null;
}

export function getLeaguePayment(league: {
  registrationFee: number | null;
  registrationFeeCurrency: string | null;
  paypalUsername: string | null;
}): PaymentInfo | null {
  if (!league.registrationFee || league.registrationFee <= 0) return null;
  const currency = league.registrationFeeCurrency ?? "EUR";
  const paypalUrl = league.paypalUsername
    ? `https://paypal.me/${league.paypalUsername}/${league.registrationFee}${currency}`
    : null;
  return {
    amount: league.registrationFee,
    currency,
    paypalUrl,
  };
}
