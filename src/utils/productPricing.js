export function calculateProductPricing({ currency, priceAmount, dollarRate = 1, marginPercent = 0, priceMultiplier = 1 }) {
  const selectedCurrency = currency === 'INR' ? 'INR' : 'USD';
  const amount = Number(priceAmount);
  const rate = Number(dollarRate);
  const margin = selectedCurrency === 'USD' ? Number(marginPercent) : 0;
  const multiplier = Number(priceMultiplier);
  const dollarAmount = selectedCurrency === 'USD' ? amount : 0;
  const convertedAmount = selectedCurrency === 'INR' ? amount : Number.isFinite(amount * rate) ? Number((amount * rate).toFixed(2)) : Number.NaN;
  const finalRate = selectedCurrency === 'INR'
    ? amount
    : Number.isFinite(convertedAmount * (1 + margin / 100) * multiplier)
      ? Number((convertedAmount * (1 + margin / 100) * multiplier).toFixed(2))
      : Number.NaN;
  return { currency: selectedCurrency, dollarAmount, convertedAmount, finalRate, dollarRate: rate, marginPercent: margin, priceMultiplier: multiplier };
}
