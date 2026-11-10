frappe.provide("archive.operations");

(function () {
	"use strict";

	let countryMapCache = null;
	let countryMapPromise = null;

	function loadCountryCodeMap() {
		if (countryMapCache) {
			return Promise.resolve(countryMapCache);
		}
		if (countryMapPromise) {
			return countryMapPromise;
		}
		countryMapPromise = frappe
			.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Country",
					fields: ["name", "code"],
					limit_page_length: 0,
				},
			})
			.then((res) => {
				const map = new Map();
				const rows = Array.isArray(res && res.message) ? res.message : [];
				rows.forEach((row) => {
					const code = String(row && row.code ? row.code : "")
						.trim()
						.toUpperCase();
					const name = String(row && row.name ? row.name : "").trim();
					if (code && name && !map.has(code)) {
						map.set(code, name);
					}
				});
				if (map.size > 0) {
					countryMapCache = map;
				} else {
					countryMapPromise = null;
				}
				return map;
			})
			.catch(() => {
				countryMapPromise = null;
				return new Map();
			});
		return countryMapPromise;
	}

	function extractSwiftCountryCode(rawSwift) {
		const clean = String(rawSwift || "")
			.replace(/\s+/g, "")
			.toUpperCase();
		if (clean.length < 6) {
			return "";
		}
		const iso2 = clean.slice(4, 6);
		return /^[A-Z]{2}$/.test(iso2) ? iso2 : "";
	}

	archive.operations.preload_country_code_map = loadCountryCodeMap;

	archive.operations.bind_swift_country_autofill = function bind_swift_country_autofill(
		swiftControl,
		countryControl
	) {
		if (!swiftControl || !countryControl) {
			return;
		}
		if (swiftControl.df?.read_only || countryControl.df?.read_only) {
			return;
		}
		if (swiftControl._archiveSwiftCountryBound) {
			return;
		}
		swiftControl._archiveSwiftCountryBound = true;

		// Preload once when the dialog opens so typing is instant without per-keystroke requests
		loadCountryCodeMap();

		let lastAutoCountry = "";
		let userManuallySelectedCountry = false;
		let isProgrammaticCountryUpdate = false;
		let seqCounter = 0;

		const readRawSwift = () => {
			if (swiftControl.$input && swiftControl.$input.length !== 0) {
				const domVal = swiftControl.$input.val();
				return String(domVal ?? "");
			}
			const ctrlVal =
				typeof swiftControl.get_value === "function" ? swiftControl.get_value() : "";
			return String(ctrlVal || "");
		};

		const readCurrentCountry = () => {
			const val =
				typeof countryControl.get_value === "function"
					? countryControl.get_value()
					: countryControl.$input
					? countryControl.$input.val()
					: "";
			return String(val || "").trim();
		};

		const setCountrySafely = async (nextCountry) => {
			if (readCurrentCountry() === nextCountry) {
				lastAutoCountry = nextCountry;
				return;
			}
			isProgrammaticCountryUpdate = true;
			try {
				if (typeof countryControl.set_value === "function") {
					await countryControl.set_value(nextCountry);
				} else if (countryControl.$input) {
					countryControl.$input.val(nextCountry);
				}
				lastAutoCountry = nextCountry;
			} finally {
				isProgrammaticCountryUpdate = false;
			}
		};

		const syncCountryFromSwift = async (explicitSwift) => {
			const seq = ++seqCounter;
			const rawSwift = explicitSwift !== undefined ? String(explicitSwift || "") : readRawSwift();
			const iso2 = extractSwiftCountryCode(rawSwift);
			const currentCountry = readCurrentCountry();

			if (!iso2) {
				if (currentCountry && currentCountry === lastAutoCountry) {
					await setCountrySafely("");
				} else {
					lastAutoCountry = "";
				}
				return;
			}

			const map = countryMapCache || (await loadCountryCodeMap());
			if (seq !== seqCounter) {
				return;
			}

			const matchedCountry = map.get(iso2) || "";
			const latestCountry = readCurrentCountry();

			if (!matchedCountry) {
				if (latestCountry && latestCountry === lastAutoCountry) {
					await setCountrySafely("");
				} else {
					lastAutoCountry = "";
				}
				return;
			}

			// Preserve an independent manual country selection made by the user
			if (userManuallySelectedCountry && latestCountry && latestCountry !== lastAutoCountry) {
				return;
			}

			await setCountrySafely(matchedCountry);
			userManuallySelectedCountry = false;
		};

		const markManualCountryEdit = () => {
			if (isProgrammaticCountryUpdate) {
				return;
			}
			const val = readCurrentCountry();
			if (!val) {
				userManuallySelectedCountry = false;
				lastAutoCountry = "";
			} else if (val !== lastAutoCountry) {
				userManuallySelectedCountry = true;
			}
		};

		if (countryControl.$input) {
			countryControl.$input.on("change.archiveSwiftCountry awesomplete-selectcomplete.archiveSwiftCountry", () => {
				markManualCountryEdit();
			});
		}
		if (countryControl.df) {
			const origCountryOnChange = countryControl.df.onchange;
			countryControl.df.onchange = function () {
				markManualCountryEdit();
				if (typeof origCountryOnChange === "function") {
					return origCountryOnChange.apply(this, arguments);
				}
			};
		}

		if (swiftControl.$input) {
			swiftControl.$input.on("input.archiveSwiftCountry change.archiveSwiftCountry", () =>
				syncCountryFromSwift()
			);
			swiftControl.$input.on("paste.archiveSwiftCountry", () => {
				setTimeout(() => syncCountryFromSwift(), 0);
			});
			swiftControl.$input.on("awesomplete-selectcomplete.archiveSwiftCountry", (e) => {
				const selected = e?.originalEvent?.text?.value;
				return syncCountryFromSwift(selected !== undefined ? selected : undefined);
			});
		}
		if (swiftControl.df) {
			const origSwiftOnChange = swiftControl.df.onchange;
			swiftControl.df.onchange = function () {
				syncCountryFromSwift();
				if (typeof origSwiftOnChange === "function") {
					return origSwiftOnChange.apply(this, arguments);
				}
			};
		}
	};
})();
