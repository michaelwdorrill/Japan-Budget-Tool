import type { AccommodationTaxRecord, DepartureTaxRecord, TaxesData } from './priceData'
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

// `effectiveTo` is the last date the rule applies, inclusive — the data
// pairs it with the successor's `effectiveFrom` on the following day
// (Tokyo's bracket rule ends 2027-03-31, the percentage rule starts
// 2027-04-01). Treating it as exclusive left a one-day hole in which no
// record matched and the city silently charged zero tax.
function findApplicableRecord(taxes: TaxesData, cityId: CityId, date: string): AccommodationTaxRecord | null {
  const candidates = taxes.accommodationTax.filter((record) => {
    if (record.cityId !== cityId) return false
    if (date < record.effectiveFrom) return false
    if (record.effectiveTo !== null && date > record.effectiveTo) return false
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
      // A statutory exemption floor is all-or-nothing: below it the stay
      // pays zero, not a proportional amount. Above it, fractional yen are
      // truncated rather than rounded (Tokyo's published 2027 rule).
      const exemptionFloor = record.exemptionBelowJpy ?? 0
      taxJpyPerPersonPerNight =
        nightlyRateJpy < exemptionFloor ? 0 : Math.floor(nightlyRateJpy * (record.percentageOfRate / 100))
      break
    }
  }

  return {
    totalTaxJpy: taxJpyPerPersonPerNight * nights * people,
    taxJpyPerPersonPerNight,
    bracketEdgeWarning,
  }
}

export interface DepartureTaxResult {
  totalTaxJpy: number
  amountJpyPerPerson: number
  chargeablePeople: number
  recordId: string | null
}

// The International Tourist Tax is a dated schedule (¥1,000 -> ¥3,000 on
// 2026-07-01), and children below the record's exemption age do not pay.
// `departureDate` is the date the traveller actually leaves Japan, not the
// trip's reference date.
//
// Not modeled, because TripConfig cannot know them: the qualifying-transit
// exemption, and the transition rule under which a ticket contracted
// before the increase with a fixed departure date may still be charged the
// old rate. The guidance layer surfaces both instead of silently guessing.
export function departureTax(
  taxes: TaxesData,
  party: { adults: number; children: { age: number }[] },
  departureDate: string,
): DepartureTaxResult {
  const record = findApplicableDepartureRecord(taxes.departureTax, departureDate)
  if (!record) {
    return { totalTaxJpy: 0, amountJpyPerPerson: 0, chargeablePeople: 0, recordId: null }
  }

  const exemptBelowAge = record.exemptBelowAge ?? 0
  const chargeableChildren = party.children.filter((child) => child.age >= exemptBelowAge).length
  const chargeablePeople = party.adults + chargeableChildren

  return {
    totalTaxJpy: record.amountJpy * chargeablePeople,
    amountJpyPerPerson: record.amountJpy,
    chargeablePeople,
    recordId: record.id,
  }
}

function findApplicableDepartureRecord(records: DepartureTaxRecord[], date: string): DepartureTaxRecord | null {
  const candidates = records.filter((record) => {
    if (date < record.effectiveFrom) return false
    if (record.effectiveTo !== null && date > record.effectiveTo) return false
    return true
  })
  if (candidates.length === 0) return null
  return candidates.reduce((latest, candidate) => (candidate.effectiveFrom > latest.effectiveFrom ? candidate : latest))
}
