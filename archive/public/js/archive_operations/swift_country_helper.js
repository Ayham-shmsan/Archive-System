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
		if (swiftControl.df?.read_only) {
			return;
		}
		if (swiftControl._archiveSwiftCountryBound) {
			return;
		}
		swiftControl._archiveSwiftCountryBound = true;

		// Preload once when the dialog opens so typing is instant without per-keystroke requests
		loadCountryCodeMap();

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
					: countryControl.value !== undefined
					? countryControl.value
					: countryControl.$input
					? countryControl.$input.val()
					: "";
			return String(val || "").trim();
		};

		const setCountrySafely = async (nextCountry) => {
			const target = String(nextCountry || "").trim();
			countryControl.value = target;
			if (typeof countryControl.set_model_value === "function") {
				try {
					await countryControl.set_model_value(target);
				} catch (_) {
					// fallback below
				}
			}
			if (typeof countryControl.set_value === "function") {
				try {
					await countryControl.set_value(target);
				} catch (_) {
					// fallback below
				}
			}
			if (countryControl.$input && countryControl.$input.length) {
				countryControl.$input.val(target);
			}
			if (typeof countryControl.set_disp_area === "function") {
				countryControl.set_disp_area(target);
			} else if (countryControl.disp_area) {
				$(countryControl.disp_area).text(target ? __(target) : "");
			}
			if (typeof countryControl.refresh === "function") {
				countryControl.refresh();
			}
		};

		const syncCountryFromSwift = async (explicitSwift) => {
			const seq = ++seqCounter;
			const rawSwift = explicitSwift !== undefined ? String(explicitSwift || "") : readRawSwift();
			const iso2 = extractSwiftCountryCode(rawSwift);

			if (!iso2) {
				if (readCurrentCountry()) {
					await setCountrySafely("");
				}
				return;
			}

			const map = countryMapCache || (await loadCountryCodeMap());
			if (seq !== seqCounter) {
				return;
			}

			const matchedCountry = map.get(iso2) || "";

			if (!matchedCountry) {
				if (readCurrentCountry()) {
					await setCountrySafely("");
				}
				return;
			}

			if (readCurrentCountry() !== matchedCountry) {
				await setCountrySafely(matchedCountry);
			}
		};

		if (swiftControl.$input) {
			swiftControl.$input.on("input.archiveSwiftCountry keyup.archiveSwiftCountry change.archiveSwiftCountry", () =>
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
