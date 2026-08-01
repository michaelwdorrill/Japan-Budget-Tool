import type { AccommodationTaxRecord, TaxesData } from './priceData'
import type { CityId } from './ids'

export interface BracketEdgeWarning {
  edgeJpy: number
  distanceJpy: number
  taxDeltaJpyPerPersonPerNight: number
}

export interface LodgingTaxResult {
  totalTaxJpy: number
  taxJpyPerPersonPerNight: number
  bracketEdgeWarning: BracketEdgeWarning | null
}

function findApplicableRecord(taxes: TaxesData, cityId: CityId, date: string): AccommodationTaxRecord | null {
  const candidates = taxes.accommodationTax.filter((record) => {
    if (record.cityId !== cityId) return false
    if (date < record.effectiveFrom) return false
    if (record.effectiveTo !== null && date >= record.effectiveTo) return false
    return true
  })
  if (candidates.length === 0) return null
  // Most recently effective record wins if more than one somehow matches.
  return candidates.reduce((latest, candidate) => (candidate.effectiveFrom > latest.effectiveFrom ? candidate : latest))
}

function bracketTax(record: AccommodationTaxRecord, nightlyRateJpy: number): { taxJpy: number; warning: BracketEdgeWarning | null } {
  const brackets = record.brackets ?? []
  const bracket = brackets.find((b) => nightlyRateJpy >= b.minJpy && (b.maxJpy === null || nightlyRateJpy <= b.maxJpy))
  if (!bracket) {
    throw new Error(`no accommodation tax bracket covers rate ¥${nightlyRateJpy} for ${record.id}`)
  }

  const thresholdPct = record.bracketEdgeWarningThresholdPct
  let warning: BracketEdgeWarning | null = null
  if (thresholdPct !== undefined && nightlyRateJpy > 0) {
    const thresholdJpy = nightlyRateJpy * (thresholdPct / 100)

    // Distance up to the next bracket's floor (only meaningful if a higher bracket exists).
    const nextBracket = brackets
      .filter((b) => b.minJpy > bracket.minJpy)
      .sort((a, b) => a.minJpy - b.minJpy)[0]
    if (nextBracket && nextBracket.minJpy - nightlyRateJpy <= thresholdJpy) {
      warning = {
        edgeJpy: nextBracket.minJpy,
        distanceJpy: nextBracket.minJpy - nightlyRateJpy,
        taxDeltaJpyPerPersonPerNight: nextBracket.taxJpy - bracket.taxJpy,
      }
    }

    // Distance down to this bracket's own floor (just crossed into a higher bracket).
    if (!warning && bracket.minJpy > 0 && nightlyRateJpy - bracket.minJpy <= thresholdJpy) {
      const previousBracket = brackets
        .filter((b) => b.maxJpy !== null && b.maxJpy < bracket.minJpy)
        .sort((a, b) => b.minJpy - a.minJpy)[0]
      if (previousBracket) {
        warning = {
          edgeJpy: bracket.minJpy,
          distanceJpy: nightlyRateJpy - bracket.minJpy,
          taxDeltaJpyPerPersonPerNight: bracket.taxJpy - previousBracket.taxJpy,
        }
      }
    }
  }

  return { taxJpy: bracket.taxJpy, warning }
}

// §3.2. `nightlyRateJpy` is the taxable accommodation charge per person per
// night (for a per_room_per_night stay, that's the room rate divided by the
// number of people sharing it — the same figure Kyoto/Osaka/Tokyo base their
// bracket on).
export function lodgingTax(
  taxes: TaxesData,
  cityId: CityId,
  nightlyRateJpy: number,
  nights: number,
  people: number,
  date: string,
): LodgingTaxResult {
  const record = findApplicableRecord(taxes, cityId, date)
  if (!record) {
    return { totalTaxJpy: 0, taxJpyPerPersonPerNight: 0, bracketEdgeWarning: null }
  }

  let taxJpyPerPersonPerNight: number
  let bracketEdgeWarning: BracketEdgeWarning | null = null

  switch (record.structure) {
    case 'bracket_per_person_per_night': {
      const result = bracketTax(record, nightlyRateJpy)
      taxJpyPerPersonPerNight = result.taxJpy
      bracketEdgeWarning = result.warning
      break
    }
    case 'flat_per_person_per_night': {
      if (record.flatTaxJpy === undefined) {
        throw new Error(`accommodation tax record ${record.id} is flat_per_person_per_night but has no flatTaxJpy`)
      }
      taxJpyPerPersonPerNight = record.flatTaxJpy
      break
    }
    case 'percentage_per_person_per_night': {
      if (record.percentageOfRate === undefined) {
        throw new Error(`accommodation tax record ${record.id} is percentage_per_person_per_night but has no percentageOfRate`)
      }
      taxJpyPerPersonPerNight = Math.round(nightlyRateJpy * (record.percentageOfRate / 100))
      break
    }
  }

  return {
    totalTaxJpy: taxJpyPerPersonPerNight * nights * people,
    taxJpyPerPersonPerNight,
    bracketEdgeWarning,
  }
}

export function departureTax(taxes: TaxesData, people: number): number {
  return taxes.departureTax.amountJpy * people
}
