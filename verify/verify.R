#!/usr/bin/env Rscript
#
# Independent reimplementation of the deterministic (Phase 2) budget engine.
# Loads the same /data/*.json and /fixtures/*.json as the TS engine, computes
# the same totals from scratch in R, and diffs against
# /fixtures/expected/*.json (emitted by `npm run generate:fixtures`).
#
# This is the most important gate in the build (§9 Phase 3): two independent
# implementations of the same arithmetic is the cheapest real correctness
# guarantee for a model like this. A divergence greater than ¥1 fails.
#
# Simplifying assumption specific to this harness: every cross-check fixture
# must set timing.startDate explicitly. The TS engine's resolveReferenceDate
# falls back to `new Date()` when neither an exact date nor a season is set,
# which is inherently non-reproducible across two separate processes run at
# different times — so that fallback path is intentionally out of scope here.

suppressPackageStartupMessages(library(jsonlite))

get_script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  if (length(file_arg) > 0) {
    return(dirname(normalizePath(sub("^--file=", "", file_arg[1]))))
  }
  getwd()
}

root_dir <- normalizePath(file.path(get_script_dir(), ".."))

read_json_file <- function(...) {
  fromJSON(file.path(root_dir, ...), simplifyVector = FALSE)
}

# JS's Math.round rounds half-away-from-zero; R's round() rounds half-to-even.
# All amounts here are non-negative, so this matches Math.round exactly.
round_half_up <- function(x) floor(x + 0.5)

# ---------------------------------------------------------------------------
# basis.ts equivalent: the single switch on CostBasis.
# ---------------------------------------------------------------------------

multiply_by_basis <- function(basis, unit_price, people = NULL, fare_equiv_people = NULL,
                               rooms = NULL, nights = NULL, days = NULL, legs = NULL, uses = NULL) {
  switch(basis,
    per_room_per_night = unit_price * rooms * nights,
    per_person_per_night = unit_price * people * nights,
    per_person_per_day = unit_price * people * days,
    per_person_per_leg = unit_price * fare_equiv_people * legs,
    per_person_per_trip = unit_price * people,
    per_party_per_trip = unit_price,
    per_person_per_use = unit_price * people * uses,
    stop(paste("unknown basis:", basis))
  )
}

child_fare_fraction <- function(age) {
  if (age < 6) return(0)
  if (age <= 11) return(0.5)
  1
}

count_children <- function(children, predicate) {
  if (length(children) == 0) return(0)
  sum(vapply(children, function(c) if (predicate(c)) 1 else 0, numeric(1)))
}

sum_children_fare <- function(children) {
  if (length(children) == 0) return(0)
  sum(vapply(children, function(c) child_fare_fraction(c$age), numeric(1)))
}

total_people <- function(party) party$adults + length(party$children)
fare_equivalent_people <- function(party) party$adults + sum_children_fare(party$children)

# ---------------------------------------------------------------------------
# priceLookup.ts equivalent
# ---------------------------------------------------------------------------

find_price <- function(records, predicate, description = "record") {
  for (r in records) if (isTRUE(predicate(r))) return(r)
  stop(paste("no price record found for", description))
}

# ---------------------------------------------------------------------------
# tax.ts equivalent (§3.2)
# ---------------------------------------------------------------------------

find_applicable_tax_record <- function(taxes, city_id, date) {
  candidates <- Filter(function(r) {
    identical(r$cityId, city_id) &&
      date >= r$effectiveFrom &&
      (is.null(r$effectiveTo) || date < r$effectiveTo)
  }, taxes$accommodationTax)

  if (length(candidates) == 0) return(NULL)
  best <- candidates[[1]]
  for (c in candidates) if (c$effectiveFrom > best$effectiveFrom) best <- c
  best
}

bracket_tax_jpy <- function(record, nightly_rate_jpy) {
  for (b in record$brackets) {
    if (nightly_rate_jpy >= b$minJpy && (is.null(b$maxJpy) || nightly_rate_jpy <= b$maxJpy)) {
      return(b$taxJpy)
    }
  }
  stop(paste("no accommodation tax bracket covers rate", nightly_rate_jpy, "for", record$id))
}

lodging_tax_total <- function(taxes, city_id, nightly_rate_jpy, nights, people, date) {
  record <- find_applicable_tax_record(taxes, city_id, date)
  if (is.null(record)) return(0)

  tax_per_person_per_night <- switch(record$structure,
    bracket_per_person_per_night = bracket_tax_jpy(record, nightly_rate_jpy),
    flat_per_person_per_night = record$flatTaxJpy,
    percentage_per_person_per_night = round_half_up(nightly_rate_jpy * (record$percentageOfRate / 100)),
    stop(paste("unknown accommodation tax structure:", record$structure))
  )

  tax_per_person_per_night * nights * people
}

departure_tax_total <- function(taxes, people) taxes$departureTax$amountJpy * people

usd_to_jpy <- function(amount_usd, jpy_per_usd) round_half_up(amount_usd * jpy_per_usd)

# ---------------------------------------------------------------------------
# Category modules (A-H), mirroring engine/*.ts one file at a time.
# ---------------------------------------------------------------------------

compute_getting_there <- function(config, price_data) {
  people <- total_people(config$party)
  total <- 0

  if (identical(config$flight$mode, "cash")) {
    total <- total + usd_to_jpy(config$flight$cashEstimateUsd, config$money$jpyPerUsd) * people
  }
  total <- total + usd_to_jpy(config$flight$taxesAndFeesUsd, config$money$jpyPerUsd) * people
  total <- total + departure_tax_total(price_data$taxes, people)

  home_side <- find_price(price_data$prices, function(p) identical(p$id, "home_side_transport"))
  total <- total + multiply_by_basis(home_side$basis, home_side$expected, people = people)

  insurance <- find_price(price_data$prices, function(p) identical(p$id, "travel_insurance"))
  total <- total + multiply_by_basis(insurance$basis, insurance$expected, people = people)

  total
}

compute_leg_lodging <- function(leg, party, price_data, reference_date) {
  people <- total_people(party)
  record <- find_price(price_data$prices, function(p) {
    identical(p$category, "lodging") && identical(p$cityId, leg$cityId) && identical(p$tier, leg$lodgingTier)
  }, paste("lodging", leg$lodgingTier, leg$cityId))

  room_cost <- multiply_by_basis(record$basis, record$expected, people = people, rooms = party$rooms, nights = leg$nights)
  nightly_rate <- if (leg$nights > 0 && people > 0) round_half_up(room_cost / (leg$nights * people)) else 0
  tax <- lodging_tax_total(price_data$taxes, leg$cityId, nightly_rate, leg$nights, people, reference_date)

  list(room = room_cost, tax = tax)
}

compute_lodging <- function(config, price_data, reference_date) {
  room_total <- 0
  tax_total <- 0
  for (leg in config$itinerary$legs) {
    r <- compute_leg_lodging(leg, config$party, price_data, reference_date)
    room_total <- room_total + r$room
    tax_total <- tax_total + r$tax
  }
  room_total + tax_total
}

find_rail_fare <- function(rail_fares, from_city, to_city) {
  for (f in rail_fares) if (identical(f$fromCityId, from_city) && identical(f$toCityId, to_city)) return(f)
  for (f in rail_fares) if (isTRUE(f$bidirectional) && identical(f$fromCityId, to_city) && identical(f$toCityId, from_city)) return(f)
  stop(paste("no rail fare found for", from_city, "->", to_city))
}

fare_for_class <- function(record, rail_class) {
  if (identical(rail_class, "green")) {
    if (!is.null(record$fareJpyGreenCar)) return(record$fareJpyGreenCar)
    return(record$fareJpyReserved)
  }
  record$fareJpyReserved
}

point_to_point_fares <- function(config, price_data) {
  legs <- config$itinerary$legs
  n <- length(legs)
  if (n < 2) return(0)

  fare_eq <- fare_equivalent_people(config$party)
  total <- 0
  for (i in 1:(n - 1)) {
    from_city <- legs[[i]]$cityId
    to_city <- legs[[i + 1]]$cityId
    if (identical(from_city, to_city)) next
    record <- find_rail_fare(price_data$railFares, from_city, to_city)
    fare <- fare_for_class(record, config$transport$railClass)
    total <- total + multiply_by_basis("per_person_per_leg", fare, fare_equiv_people = fare_eq, legs = 1)
  }
  total
}

national_pass_fares <- function(config, price_data, pass_id) {
  pass <- find_price(price_data$passes$nationalPasses, function(p) identical(p$id, pass_id), paste("JR pass", pass_id))
  children <- config$party$children
  full_fare_children <- count_children(children, function(c) c$age >= 12)
  half_fare_children <- count_children(children, function(c) c$age >= 6 && c$age <= 11)
  full_fare_count <- config$party$adults + full_fare_children

  full_fare_count * pass$priceJpyOfficialChannel +
    half_fare_children * round_half_up(pass$priceJpyOfficialChannel * (pass$childDiscountPct / 100))
}

luggage_forwarding_total <- function(config, price_data) {
  if (!isTRUE(config$transport$luggageForwarding)) return(0)
  legs <- config$itinerary$legs
  transfers <- max(0, length(legs) - 1)
  if (transfers == 0) return(0)

  record <- find_price(price_data$prices, function(p) identical(p$id, "luggage_forwarding_per_bag_per_transfer"))
  people <- total_people(config$party)
  multiply_by_basis(record$basis, record$expected, fare_equiv_people = people, legs = transfers)
}

compute_transport <- function(config, price_data) {
  strategy <- config$transport$strategy
  is_explicit_pass <- !(strategy %in% c("auto", "point_to_point"))
  fare_total <- if (is_explicit_pass) {
    national_pass_fares(config, price_data, strategy)
  } else {
    point_to_point_fares(config, price_data)
  }
  fare_total + luggage_forwarding_total(config, price_data)
}

compute_local_transport <- function(config, price_data) {
  people <- total_people(config$party)
  total <- 0
  for (leg in config$itinerary$legs) {
    record <- find_price(price_data$prices, function(p) {
      identical(p$category, "local_transport") && identical(p$cityId, leg$cityId)
    }, paste("local transit", leg$cityId))
    total <- total + multiply_by_basis(record$basis, record$expected, people = people, days = leg$nights)
  }
  total
}

meal_cost <- function(slot, tier, people, nights, price_data) {
  id <- paste0("food_", slot, "_", tier)
  record <- find_price(price_data$prices, function(p) identical(p$id, id), id)
  multiply_by_basis(record$basis, record$expected, people = people, days = nights)
}

leg_food_cost <- function(leg, people, price_data) {
  is_ryokan <- identical(leg$lodgingTier, "ryokan_hanmeshi")
  total <- 0
  if (!is_ryokan) total <- total + meal_cost("breakfast", leg$food$breakfast, people, leg$nights, price_data)
  total <- total + meal_cost("lunch", leg$food$lunch, people, leg$nights, price_data)
  if (!is_ryokan) total <- total + meal_cost("dinner", leg$food$dinner, people, leg$nights, price_data)

  splurge_meals <- leg$splurgeMeals
  if (!is.null(splurge_meals) && splurge_meals > 0) {
    record <- find_price(price_data$prices, function(p) identical(p$id, "splurge_meal_kaiseki_omakase"))
    total <- total + multiply_by_basis(record$basis, record$expected, people = people, uses = splurge_meals)
  }
  total
}

compute_food <- function(config, price_data) {
  people <- total_people(config$party)
  total <- 0
  for (leg in config$itinerary$legs) total <- total + leg_food_cost(leg, people, price_data)

  drinks <- find_price(price_data$prices, function(p) identical(p$id, "food_drinks_snacks"))
  total_nights <- sum(vapply(config$itinerary$legs, function(l) l$nights, numeric(1)))
  total + multiply_by_basis(drinks$basis, drinks$expected, people = people, days = total_nights)
}

leg_activities_cost <- function(leg, people, price_data) {
  total <- 0
  for (sel in leg$activities) {
    activity <- find_price(price_data$activities$namedActivities, function(a) identical(a$id, sel$activityId), sel$activityId)
    total <- total + multiply_by_basis(activity$basis, activity$expected, people = people, uses = sel$quantity)
  }
  fallback <- find_price(price_data$activities$activityTierFallback, function(a) identical(a$tier, leg$activityTierFallback))
  total + multiply_by_basis(fallback$basis, fallback$expected, people = people, days = leg$nights)
}

compute_activities <- function(config, price_data) {
  people <- total_people(config$party)
  total <- 0
  for (leg in config$itinerary$legs) total <- total + leg_activities_cost(leg, people, price_data)
  total
}

compute_connectivity <- function(config, price_data) {
  people <- total_people(config$party)
  total_nights <- sum(vapply(config$itinerary$legs, function(l) l$nights, numeric(1)))

  esim_id <- if (total_nights <= 7) "esim_7day" else "esim_14day"
  esim <- find_price(price_data$prices, function(p) identical(p$id, esim_id))
  total <- multiply_by_basis(esim$basis, esim$expected, people = people)

  coin_lockers <- find_price(price_data$prices, function(p) identical(p$id, "coin_lockers"))
  total <- total + multiply_by_basis(coin_lockers$basis, coin_lockers$expected, people = people)

  if (total_nights > 10) {
    laundry <- find_price(price_data$prices, function(p) identical(p$id, "laundry"))
    total <- total + multiply_by_basis(laundry$basis, laundry$expected, people = people)
  }
  total
}

compute_shopping <- function(config, price_data) {
  people <- total_people(config$party)
  omiyage <- find_price(price_data$prices, function(p) identical(p$id, "omiyage_budget"))
  total <- multiply_by_basis(omiyage$basis, omiyage$expected, people = people)

  personal_budget <- config$shopping$personalBudgetJpy
  if (!is.null(personal_budget) && personal_budget > 0) total <- total + personal_budget
  total
}

# ---------------------------------------------------------------------------
# index.ts equivalent: orchestration + contingency (I1).
# ---------------------------------------------------------------------------

compute_budget_totals <- function(config, price_data) {
  reference_date <- config$timing$startDate
  if (is.null(reference_date)) {
    stop("verify.R requires timing.startDate to be set on every cross-check fixture")
  }

  getting_there <- compute_getting_there(config, price_data)
  lodging <- compute_lodging(config, price_data, reference_date)
  transport <- compute_transport(config, price_data)
  local_transport <- compute_local_transport(config, price_data)
  food <- compute_food(config, price_data)
  activities <- compute_activities(config, price_data)
  connectivity <- compute_connectivity(config, price_data)
  shopping <- compute_shopping(config, price_data)

  variable_total <- lodging + transport + local_transport + food + activities + connectivity + shopping
  contingency <- round_half_up(variable_total * (config$money$contingencyPct / 100))

  total_party <- getting_there + variable_total + contingency
  people <- total_people(config$party)
  total_per_person <- if (people > 0) round_half_up(total_party / people) else total_party

  list(
    referenceDate = reference_date,
    totalsByCategory = list(
      getting_there = getting_there,
      lodging = lodging,
      intercity_transport = transport,
      local_transport = local_transport,
      food = food,
      activities = activities,
      connectivity = connectivity,
      shopping = shopping,
      reserves = contingency
    ),
    fixedCostsJpy = getting_there,
    variableCostsJpy = variable_total,
    contingencyJpy = contingency,
    totalJpyParty = total_party,
    totalJpyPerPerson = total_per_person
  )
}

# ---------------------------------------------------------------------------
# Main: load data once, diff every fixture against its expected output.
# ---------------------------------------------------------------------------

TOLERANCE_JPY <- 1

price_data <- list(
  cities = read_json_file("data", "cities.json"),
  prices = read_json_file("data", "prices.json"),
  railFares = read_json_file("data", "rail-fares.json"),
  passes = read_json_file("data", "passes.json"),
  taxes = read_json_file("data", "taxes.json"),
  activities = read_json_file("data", "activities.json"),
  seasons = read_json_file("data", "seasons.json")
)

fixtures_dir <- file.path(root_dir, "fixtures")
expected_dir <- file.path(fixtures_dir, "expected")
fixture_files <- sort(list.files(fixtures_dir, pattern = "\\.json$", full.names = FALSE))

if (length(fixture_files) == 0) {
  stop("no fixture files found in fixtures/")
}

diff_field <- function(fixture_name, field_name, actual, expected, failures) {
  delta <- abs(actual - expected)
  status <- if (delta <= TOLERANCE_JPY) "OK" else "FAIL"
  cat(sprintf("  [%s] %-28s R=%12.0f  TS=%12.0f  Δ=%.2f\n", status, field_name, actual, expected, delta))
  if (delta > TOLERANCE_JPY) {
    failures[[length(failures) + 1]] <- sprintf("%s: %s diverges by ¥%.2f (R=%.0f, TS=%.0f)", fixture_name, field_name, delta, actual, expected)
  }
  failures
}

all_failures <- list()

for (fixture_file in fixture_files) {
  fixture_name <- fixture_file
  expected_file <- file.path(expected_dir, sub("\\.json$", ".expected.json", fixture_file))
  if (!file.exists(expected_file)) {
    stop(paste("missing expected fixture:", expected_file, "- run `npm run generate:fixtures` first"))
  }

  config <- read_json_file("fixtures", fixture_file)
  expected <- read_json_file("fixtures", "expected", sub("\\.json$", ".expected.json", fixture_file))

  cat(sprintf("\n%s\n", fixture_name))
  actual <- compute_budget_totals(config, price_data)

  top_level_fields <- c("fixedCostsJpy", "variableCostsJpy", "contingencyJpy", "totalJpyParty", "totalJpyPerPerson")
  for (field in top_level_fields) {
    all_failures <- diff_field(fixture_name, field, actual[[field]], expected[[field]], all_failures)
  }

  for (category in names(expected$totalsByCategory)) {
    all_failures <- diff_field(
      fixture_name,
      paste0("totalsByCategory.", category),
      actual$totalsByCategory[[category]],
      expected$totalsByCategory[[category]],
      all_failures
    )
  }

  if (!identical(actual$referenceDate, expected$referenceDate)) {
    all_failures[[length(all_failures) + 1]] <- sprintf("%s: referenceDate diverges (R=%s, TS=%s)", fixture_name, actual$referenceDate, expected$referenceDate)
  }
}

cat("\n", strrep("=", 72), "\n", sep = "")
if (length(all_failures) == 0) {
  cat(sprintf("PASS: all %d fixtures agree between R and TS within ¥%d.\n", length(fixture_files), TOLERANCE_JPY))
  quit(status = 0)
} else {
  cat(sprintf("FAIL: %d divergence(s) exceeded ¥%d:\n", length(all_failures), TOLERANCE_JPY))
  for (f in all_failures) cat(" -", f, "\n")
  quit(status = 1)
}
