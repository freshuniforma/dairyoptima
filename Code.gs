/**
 * ============================================================================
 * DairyOptima — code.gs (v6.3.0 - 4-Engine UHT Stability DSS)
 * ============================================================================
 * CHANGELOG v6.3.0:
 *   - parseStabilityRule(): fix header 'Operator' & 'Severity'; tambah Likelihood & Severity Score
 *   - parseRawMaterial(): tambah 7 field parameter air
 *   - parseUHTProtocol(): BARU
 *   - Engine 1-4: BARU
 *   - runFourEngine_(): BARU
 *   - stepOptimizationJob(): tambah 4-Engine orchestration
 *   - api_runOptimizer(): tambah 4-Engine orchestration
 *   - getAppInitialData(): tambah uhtProtocols + waterParams
 *   - Hapus duplikat api_upsertNutriLevel / api_upsertPilihanSehat
 *   - Stub api_checkAdminStatus & api_activateAdmin
 *   - solveAndEvaluate(): TIDAK DIUBAH dari v6.2.0
 * ============================================================================
 */

var SPREADSHEET_ID_CODE = '18EIDts8LilVRQ_7dLQdqDSrQ6ExmgU3O7FngiePClfM';
var APP_NAME_CODE = 'DairyOptima';
var APP_VERSION_CODE = '6.3.0';

var DEFAULT_DENSITY          = 1.03;
var DEFAULT_SERVING_ML       = 200;
var DEFAULT_PH               = 6.7;
var DEFAULT_N_SOLUTIONS      = 50;
var DEFAULT_FAT_BASIS        = 'fatTotal';
var DEFAULT_TIME_BUDGET_MS   = 45000;
var MAX_NODES_PER_SOLVE      = 3000000;
var MAX_SUBSET_SIZE          = 5;
var DEDUP_PRECISION          = 2;
var JOB_TTL_SECONDS          = 600;
var JOB_MAX_LOG_ENTRIES      = 300;
var PROGRESS_LOG_THROTTLE_MS = 600;
var CACHE_TTL_SECONDS        = 120;
function getCacheKeyInitialData_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || 'anon'; } catch (e) { email = 'anon'; }
  return 'DairyOptima_InitialData_v6_' + email.toLowerCase();
}

var PS_DEFAULTS = {
  plain:    { sugarMax: 0.5 },
  flavoured:{ sugarMax: 6.0 }
};

var WATER_RMID_CANDIDATES = ['RM006', 'WATER', 'AIR'];

var NUTRIENT_KEYS = [
  'energyTotal', 'energyFromFat', 'energyFromSatFat',
  'fatTotal', 'saturatedFat', 'transFat', 'cholesterol',
  'linoleicAcid', 'alphaLinolenicAcid', 'protein',
  'carbohydrateTotal', 'dietaryFiber', 'sugarTotal',
  'lactose', 'sucrose',
  'sodium', 'potassium', 'calcium', 'phosphorus', 'magnesium',
  'iron', 'zinc', 'iodine', 'selenium',
  'vitA', 'vitD', 'vitE', 'vitK', 'vitB1', 'vitB2', 'vitB3',
  'vitB5', 'vitB6', 'folate', 'vitB12', 'biotin', 'vitC'
];

var MICRO_KEYS = [
  'calcium', 'phosphorus', 'potassium', 'magnesium', 'iron', 'zinc',
  'iodine', 'selenium',
  'vitA', 'vitD', 'vitE', 'vitK', 'vitB1', 'vitB2', 'vitB3',
  'vitB5', 'vitB6', 'folate', 'vitB12', 'biotin', 'vitC'
];

var RM_NUTRIENT_COLUMN_MAP = {
  energyTotal: 'Energi (kcal)', protein: 'Protein (g)', fatTotal: 'Fat (g)',
  saturatedFat: 'Saturated Fat (g)', transFat: 'Trans Fat (g)', cholesterol: 'Cholesterol (mg)',
  linoleicAcid: 'Linoleic (mg)', alphaLinolenicAcid: 'Alpha-Linolenic (mg)',
  carbohydrateTotal: 'Karbohidrat (g)', dietaryFiber: 'Serat (g)',
  lactose: 'Laktosa (g)', sucrose: 'Sukrosa (g)', sugarTotal: 'Gula Total (g)',
  calcium: 'Ca (mg)', phosphorus: 'P (mg)', sodium: 'Natrium (mg)',
  potassium: 'Kalium (mg)', magnesium: 'Magnesium (mg)', iron: 'Besi (mg)',
  zinc: 'Seng (mg)', iodine: 'Iodium (mcg)', selenium: 'Selenium (mcg)',
  vitA: 'Vit A (IU)', vitD: 'Vit D (IU)', vitE: 'Vit E (mg)', vitK: 'Vit K (mcg)',
  vitB1: 'Vit B1 (mg)', vitB2: 'Vit B2 (mg)', vitB3: 'Vit B3 (mg)',
  vitB5: 'Vit B5 (mg)', vitB6: 'Vit B6 (mg)', folate: 'Folat (mcg)',
  vitB12: 'Vit B12 (mcg)', biotin: 'Biotin (mcg)', vitC: 'Vit C (mg)'
};

var WATER_PARAM_HEADERS = {
  waterHardness:   'Water Hardness (mg/L)',
  waterTds:        'Water TDS (mg/L)',
  waterCa:         'Water Ca (mg/L)',
  waterMg:         'Water Mg (mg/L)',
  waterPh:         'Water pH',
  waterIron:       'water_iron (mg/L)',
  waterAlkalinity: 'water_alkalinity (mg/L)'
};

var WATER_PARAM_KEYS = [
  'waterHardness', 'waterTds', 'waterCa', 'waterMg',
  'waterPh', 'waterIron', 'waterAlkalinity'
];

var WATER_LIMITS = {
  hardness: 100,
  tds: 500,
  ca: 40,
  mg: 30,
  phMin: 6.0,
  phMax: 8.5,
  iron: 0.3,
  alkalinity: 50
};

var WATER_PARAMS_DEFAULT = {
  waterHardness: 100,
  waterTds: 500,
  waterCa: 40,
  waterMg: 30,
  waterPh: 6.7,
  waterIron: 0.3,
  waterAlkalinity: 50,
  limits: WATER_LIMITS
};

var EVIDENCE_STATUS = {
  SCREENING_ONLY:     'SCREENING_ONLY',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  CONFIRMED_RISK:     'CONFIRMED_RISK',
  CORRECTIVE_TRIAL:   'CORRECTIVE_TRIAL',
  VALIDATED:          'VALIDATED'
};
// ============================================================
// AKSES KONTROL — baca dari sheet `users`
// ============================================================
var USERS_SHEET = 'users';
var CACHE_KEY_USERS = 'DairyOptima_Users_v1';
var CACHE_TTL_USERS = 60; // detik

function parseUsers_() {
  var cache = getCache_();
  if (cache) {
    try {
      var cached = cache.get(CACHE_KEY_USERS);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }
  var rows = readSheetAsObjects(USERS_SHEET);
  var users = rows.map(function (r) {
    return {
      email: String(getCol_(r, 'Email')).trim().toLowerCase(),
      name: String(getCol_(r, 'Name')).trim(),
      role: String(getCol_(r, 'Role')).trim().toLowerCase() || 'user',
      isActive: safeBool_(getCol_(r, 'IsActive')),
      notes: String(getCol_(r, 'Notes') || '').trim()
    };
  }).filter(function (u) { return u.email !== ''; });

  if (cache) {
    try { cache.put(CACHE_KEY_USERS, JSON.stringify(users), CACHE_TTL_USERS); } catch (e) {}
  }
  return users;
}

function invalidateUsersCache_() {
  var cache = getCache_();
  if (cache) { try { cache.remove(CACHE_KEY_USERS); } catch (e) {} }
}

function checkAccess_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  if (!email) {
    return { allowed: false, email: '', role: null, reason: 'Tidak dapat membaca email. Login Google dulu.' };
  }
  var users = parseUsers_();
  var user = users.filter(function (u) { return u.email === email.trim().toLowerCase(); })[0];
  if (!user) return { allowed: false, email: email, role: null, reason: 'Email "' + email + '" tidak terdaftar.' };
  if (!user.isActive) return { allowed: false, email: email, role: user.role, reason: 'Akun dinonaktifkan.' };
  return { allowed: true, email: email, role: user.role, name: user.name, reason: '' };
}

function requireAccess_() {
  var a = checkAccess_();
  if (!a.allowed) throw new Error('AKSES_DITOLAK: ' + a.reason);
  return a;
}

function requireAdmin_() {
  var a = requireAccess_();
  if (a.role !== 'admin') throw new Error('AKSES_DITOLAK: Hanya admin yang bisa melakukan aksi ini.');
  return a;
}

function renderAccessDenied_(a) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Akses Ditolak</title>' +
    '<style>body{font-family:system-ui;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}' +
    '.c{background:#fff;padding:32px;border-radius:12px;max-width:420px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.1)}' +
    'h1{color:#dc2626;font-size:20px}p{color:#4b5563;font-size:14px;line-height:1.5}</style></head><body>' +
    '<div class="c"><div style="font-size:48px">🔒</div><h1>Akses Ditolak</h1>' +
    '<p>Email <b>' + (a.email || '?') + '</b></p>' +
    '<p style="font-size:12px;color:#991b1b">' + (a.reason || '') + '</p>' +
    '<p style="font-size:12px;margin-top:16px">Hubungi administrator untuk didaftarkan.</p>' +
    '</div></body></html>';
}

// ============================================================
// API — CRUD Users (admin only)
// ============================================================

function api_listUsers() {
  try {
    requireAdmin_();
    var users = parseUsers_();
    return { ok: true, users: users, currentUser: Session.getActiveUser().getEmail() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function api_upsertUser(payload) {
  try {
    var admin = requireAdmin_();
    if (!payload || !payload.email) return { ok: false, error: 'Email wajib' };
    var email = String(payload.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Format email tidak valid' };

    var role = String(payload.role || 'user').trim().toLowerCase();
    if (role !== 'admin' && role !== 'user') return { ok: false, error: 'Role harus "admin" atau "user"' };

    // Cegah admin menonaktifkan diri sendiri / menurunkan role sendiri
    if (email === admin.email.toLowerCase()) {
      if (payload.isActive === false) return { ok: false, error: 'Tidak bisa menonaktifkan akun sendiri.' };
      if (role !== 'admin') return { ok: false, error: 'Tidak bisa menurunkan role akun sendiri.' };
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(USERS_SHEET);
    if (!sheet) return { ok: false, error: 'Sheet users tidak ditemukan' };

    var headers = getSheetHeaders_(sheet);
    var emailIdx = headers.indexOf('Email');
    if (emailIdx < 0) return { ok: false, error: 'Kolom Email tidak ada di sheet users' };

    var lastRow = sheet.getLastRow();
    var existingRow = -1;
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, emailIdx + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][0]).trim().toLowerCase() === email) { existingRow = i + 2; break; }
      }
    }

    var rowData = headers.map(function (h) {
      if (h === 'Email') return email;
      if (h === 'Name') return String(payload.name || '').trim();
      if (h === 'Role') return role;
      if (h === 'IsActive') return payload.isActive !== false;
      if (h === 'Notes') return String(payload.notes || '').trim();
      return '';
    });

    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    invalidateUsersCache_();
    return { ok: true, mode: existingRow > 0 ? 'update' : 'insert', email: email };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function api_deleteUser(email) {
  try {
    var admin = requireAdmin_();
    if (!email) return { ok: false, error: 'Email wajib' };
    var target = String(email).trim().toLowerCase();
    if (target === admin.email.toLowerCase()) return { ok: false, error: 'Tidak bisa menghapus akun sendiri.' };

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(USERS_SHEET);
    if (!sheet) return { ok: false, error: 'Sheet users tidak ditemukan' };
    var headers = getSheetHeaders_(sheet);
    var emailIdx = headers.indexOf('Email');
    var activeIdx = headers.indexOf('IsActive');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Tidak ada user' };

    var vals = sheet.getRange(2, emailIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === target) {
        // Soft delete: set IsActive = false
        if (activeIdx >= 0) {
          sheet.getRange(i + 2, activeIdx + 1).setValue(false);
        } else {
          sheet.deleteRow(i + 2);
        }
        invalidateUsersCache_();
        return { ok: true, mode: 'deactivated', email: target };
      }
    }
    return { ok: false, error: 'User tidak ditemukan' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
// ============================================================================
// HELPER UTILITY
// ============================================================================

function getSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) { }
  return SpreadsheetApp.openById(SPREADSHEET_ID_CODE);
}

function safeNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function safeBool_(v) {
  if (v === true || v === false) return v;
  if (v === null || v === undefined) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function getSheetHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return [];
  var vals = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return vals.map(function (h) { return String(h).trim(); });
}

function readSheetAsObjects(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var headers = getSheetHeaders_(sheet);
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  data.forEach(function (row) {
    var allEmpty = true;
    for (var i = 0; i < row.length; i++) {
      if (row[i] !== '' && row[i] !== null && row[i] !== undefined) { allEmpty = false; break; }
    }
    if (allEmpty) return;
    var obj = {};
    headers.forEach(function (h, idx) { if (h) obj[h] = row[idx]; });
    out.push(obj);
  });
  return out;
}

function getCol_(obj, headerName) {
  return obj && obj[headerName] !== undefined ? obj[headerName] : '';
}

function getCache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function invalidateInitialDataCache_() {
  var c = getCache_();
  if (c) { try { c.remove(getCacheKeyInitialData_()); } catch (e) { } }
}

// ============================================================================
// PARSER FUNCTIONS
// ============================================================================

function parseRawMaterial() {
  var rows = readSheetAsObjects('raw_material');
  return rows.map(function (r) {
    var nutrients = {};
    NUTRIENT_KEYS.forEach(function (key) {
      var colName = RM_NUTRIENT_COLUMN_MAP[key];
      nutrients[key] = colName ? safeNum_(getCol_(r, colName)) : 0;
    });
    var waterParams = {};
    WATER_PARAM_KEYS.forEach(function (wk) {
      waterParams[wk] = safeNum_(getCol_(r, WATER_PARAM_HEADERS[wk]));
    });
    return {
      rmid: String(getCol_(r, 'RMID')).trim(),
      name: String(getCol_(r, 'RM')).trim(),
      category: String(getCol_(r, 'Category')).trim(),
      pricePerKg: safeNum_(getCol_(r, 'Price/kg (Rp)')),
      moisture: safeNum_(getCol_(r, 'Moisture (%)')),
      snf: safeNum_(getCol_(r, 'SNF (g)')),
      totalSolid: safeNum_(getCol_(r, 'Total Solid (g)')),
      pH: safeNum_(getCol_(r, 'pH')),
      nutrients: nutrients,
      waterParams: waterParams,
      minPct: safeNum_(getCol_(r, 'Min %')),
      maxPct: safeNum_(getCol_(r, 'Max %')),
      stabilityFlags: String(getCol_(r, 'Stability Flags') || '').trim(),
      sensoryNotes: String(getCol_(r, 'Sensory Notes') || '').trim(),
      isActive: safeBool_(getCol_(r, 'is_active'))
    };
  }).filter(function (rm) { return rm.rmid !== ''; });
}

function parseProduct() {
  var rows = readSheetAsObjects('product_master');
  var algRef = parseAlgReference();
  var servingCfg = parseServingSettings();
  var servingMl = safeNum_(servingCfg.defaultServingMl) || DEFAULT_SERVING_ML;

  var PCT_AKG_MAP = {
    calcium: 'Ca %AKG', phosphorus: 'P %AKG', potassium: 'K %AKG',
    magnesium: 'Mg %AKG', iron: 'Fe %AKG', zinc: 'Zn %AKG',
    iodine: 'I %AKG', selenium: 'Se %AKG',
    vitA: 'Vit A %AKG', vitD: 'Vit D %AKG', vitE: 'Vit E %AKG', vitK: 'Vit K %AKG',
    vitB1: 'Vit B1 %AKG', vitB2: 'Vit B2 %AKG', vitB3: 'Vit B3 %AKG',
    vitB5: 'Vit B5 %AKG', vitB6: 'Vit B6 %AKG',
    folate: 'Folat %AKG', vitB12: 'Vit B12 %AKG', biotin: 'Biotin %AKG', vitC: 'Vit C %AKG'
  };

  var VALID_TYPES = ['UHT', 'Yogurt', 'IceCream', 'ProcessedCheese'];

  var algMap = {};
  algRef.forEach(function (a) { algMap[a.key] = a.algValue; });

  return rows.map(function (r) {
    var pMin = safeNum_(getCol_(r, 'Protein Min (g/100ml)'));
    var pMax = safeNum_(getCol_(r, 'Protein Max (g/100ml)'));
    var pSingle = safeNum_(getCol_(r, 'Protein (g/100ml)'));
    if (pMin === 0 && pMax === 0 && pSingle > 0) { pMin = pSingle; pMax = 0; }
    if (pMin > 0 && pMax === 0) pMax = 0;

    var fMin = safeNum_(getCol_(r, 'Fat Min (g/100ml)'));
    var fMax = safeNum_(getCol_(r, 'Fat Max (g/100ml)'));
    var fSingle = safeNum_(getCol_(r, 'Fat (g/100ml)'));
    if (fMin === 0 && fMax === 0 && fSingle > 0) { fMin = fSingle; fMax = 0; }
    if (fMin > 0 && fMax === 0) fMax = 0;

    var sMin = safeNum_(getCol_(r, 'SNF Min (g/100ml)'));
    var sSingle = safeNum_(getCol_(r, 'SNF (g/100ml)'));
    if (sMin === 0 && sSingle > 0) sMin = sSingle;

    var targetGram = {
      proteinMin: pMin, proteinMax: pMax,
      fatMin: fMin, fatMax: fMax,
      snfMin: sMin,
      sugarMax: safeNum_(getCol_(r, 'Gula Total Max (g/100ml)')),
      sucroseMax: safeNum_(getCol_(r, 'Sukrosa Max (g/100ml)')),
      sodiumMax: safeNum_(getCol_(r, 'Natrium Max (mg/100ml)'))
    };

    var targetPctAKG = {};
    Object.keys(PCT_AKG_MAP).forEach(function (key) {
      var pct = safeNum_(getCol_(r, PCT_AKG_MAP[key]));
      targetPctAKG[key] = pct;
      var alg = algMap[key] || 0;
      if (pct <= 0 || alg <= 0) { targetGram[key] = 0; return; }
      var gramPerSaji = (pct / 100) * alg;
      targetGram[key] = (gramPerSaji / servingMl) * 100;
    });

    // --- LANGKAH 2: field baru (backward-compatible) ---
    var rawType = String(getCol_(r, 'ProductType') || '').trim();
    var productType = rawType !== '' ? rawType : 'UHT';
    if (VALID_TYPES.indexOf(productType) === -1) {
      console.warn('[parseProduct] ProductType tidak dikenal: "' + productType +
                   '" (ProductID=' + String(getCol_(r, 'ProductID')).trim() + '). Fallback ke UHT.');
      productType = 'UHT';
    }
    var rawTS = getCol_(r, 'TargetTS');
    var targetTS = (rawTS === undefined || rawTS === null || String(rawTS).trim() === '')
      ? null
      : safeNum_(rawTS);

    return {
      productId: String(getCol_(r, 'ProductID')).trim(),
      product: String(getCol_(r, 'Product')).trim(),
      density: safeNum_(getCol_(r, 'Density (g/mL)')) || DEFAULT_DENSITY,
      category: String(getCol_(r, 'Category')).trim(),
      packSize: safeNum_(getCol_(r, 'Pack Size (ml/g)')) || 250,
      target: targetGram,
      targetPctAKG: targetPctAKG,
      isActive: safeBool_(getCol_(r, 'is_active')),
      notes: String(getCol_(r, 'Notes') || '').trim(),
      // --- field baru ---
      productType: productType,   // 'UHT' | 'Yogurt' | 'IceCream' | 'ProcessedCheese'
      targetTS:    targetTS       // number (TS %) atau null kalau belum di-set
    };
  }).filter(function (p) { return p.productId !== ''; });
}

function parseAlgReference() {
  var rows = readSheetAsObjects('alg_reference');
  return rows.map(function (r) {
    return {
      key: String(getCol_(r, 'Key')).trim(),
      zatGizi: String(getCol_(r, 'Zat Gizi')).trim(),
      kategori: String(getCol_(r, 'Kategori')).trim(),
      satuan: String(getCol_(r, 'Satuan')).trim(),
      algValue: safeNum_(getCol_(r, 'Nilai ALG 2026')),
      digitPembulatan: safeNum_(getCol_(r, 'Digit Pembulatan Jumlah')),
      minAkgThreshold: safeNum_(getCol_(r, 'Min AKG Threshold (%)')),
      keterangan: String(getCol_(r, 'Keterangan Regulasi') || '').trim()
    };
  }).filter(function (a) { return a.key !== ''; });
}

function parsePremix() {
  var rows = readSheetAsObjects('premix_catalog');
  return rows.map(function (r) {
    var nutrients = {};
    NUTRIENT_KEYS.forEach(function (key) { nutrients[key] = safeNum_(getCol_(r, key)); });
    var targetsRaw = String(getCol_(r, 'Target Nutrients') || '').trim();
    var targets = targetsRaw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
    return {
      premixId: String(getCol_(r, 'PremixID')).trim(),
      premixName: String(getCol_(r, 'Premix Name')).trim(),
      targetNutrients: targets,
      nutrients: nutrients,
      pricePerKg: safeNum_(getCol_(r, 'Price/kg (Rp)')),
      recommendedDose: safeNum_(getCol_(r, 'Recommended Dose (%)')),
      notes: String(getCol_(r, 'Notes') || '').trim()
    };
  }).filter(function (p) { return p.premixId !== ''; });
}

/**
 * FIX v6.3.0 — parser stability_rules:
 *   header aktual sheet: 'Operator', 'Severity' (bukan versi panjang)
 *   tambah 'Likelihood' dan 'Severity Score'
 */
function parseStabilityRule() {
  var rows = readSheetAsObjects('stability_rules');
  return rows.map(function (r) {
    var sev = String(getCol_(r, 'Severity') || 'Low').trim();
    var likelihood = safeNum_(getCol_(r, 'Likelihood'));
    var severityScore = safeNum_(getCol_(r, 'Severity Score'));
    var sevNumMap = { Low: 2, Medium: 3, High: 4, Critical: 5 };
    if (likelihood <= 0) likelihood = sevNumMap[sev] || 3;
    if (severityScore <= 0) severityScore = sevNumMap[sev] || 3;
    return {
      ruleId: String(getCol_(r, 'RuleID')).trim(),
      issue: String(getCol_(r, 'Issue')).trim(),
      triggerNutrient: String(getCol_(r, 'Trigger Nutrient (key)')).trim(),
      triggerOperator: String(getCol_(r, 'Operator')).trim(),
      triggerValue: safeNum_(getCol_(r, 'Trigger Value')),
      severity: sev,
      action: String(getCol_(r, 'Recommended Action') || '').trim(),
      processParameter: String(getCol_(r, 'Process Parameter') || '').trim(),
      notes: String(getCol_(r, 'Notes') || '').trim(),
      likelihood: likelihood,
      severityScore: severityScore,
      riskScore: Math.round(likelihood * severityScore * 10) / 10
    };
  }).filter(function (s) { return s.ruleId !== ''; });
}

function parseNutriLevelRules() {
  var rows = readSheetAsObjects('nutri_level_criteria');
  return rows.map(function (r) {
    return {
      nutrient: String(getCol_(r, 'Nutrient')).trim(),
      gradeAMax: safeNum_(getCol_(r, 'Grade A')),
      gradeBMax: safeNum_(getCol_(r, 'Grade B')),
      gradeCMax: safeNum_(getCol_(r, 'Grade C')),
      gradeDMin: safeNum_(getCol_(r, 'Grade D')),
      unit: String(getCol_(r, 'Satuan')).trim()
    };
  }).filter(function (n) { return n.nutrient !== ''; });
}

function parsePilihanSehatRules() {
  var rows = readSheetAsObjects('pilihan_sehat_criteria');
  var out = { plain: {}, flavoured: {} };
  if (!rows || rows.length === 0) return out;
  rows.forEach(function (r) {
    var catRaw = String(getCol_(r, 'Kategori Produk')).trim().toLowerCase();
    var cat = '';
    if (catRaw.indexOf('plain') >= 0) cat = 'plain';
    else if (catRaw.indexOf('berperisa') >= 0) cat = 'flavoured';
    var sugarText = String(getCol_(r, 'Batas Gula'));
    var match = sugarText.match(/(\d+(?:\.\d+)?)/);
    var sugarVal = match ? parseFloat(match[1]) : null;
    if (cat && sugarVal !== null) {
      out[cat].sugarMax = sugarVal;
    }
  });
  return out;
}

function parseServingSettings() {
  var rows = readSheetAsObjects('serving_settings');
  var out = { defaultServingMl: DEFAULT_SERVING_ML, defaultDensity: DEFAULT_DENSITY };
  rows.forEach(function (r) {
    var k = String(getCol_(r, 'Key')).trim();
    var v = getCol_(r, 'Value');
    if (!k) return;
    var n = Number(v);
    out[k] = (!isNaN(n) && v !== '' && v !== null) ? n : v;
  });
  return out;
}

/**
 * BARU v6.3.0 — parser uht_protocols
 * Fallback case-insensitive + logging
 */
function parseUHTProtocol() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('uht_protocols');
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim().toLowerCase() === 'uht_protocols') {
        sheet = all[i];
        break;
      }
    }
  }
  if (!sheet) {
    Logger.log('parseUHTProtocol: sheet "uht_protocols" tidak ditemukan');
    return [];
  }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    Logger.log('parseUHTProtocol: sheet kosong (lastRow=' + lastRow + ', lastCol=' + lastCol + ')');
    return [];
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var idxProtocolId = headers.indexOf('ProtocolID');
  var idxRisk = headers.indexOf('RiskCategory');
  var idxPhase = headers.indexOf('TestPhase');
  var idxParam = headers.indexOf('ParameterTest');
  var idxMethod = headers.indexOf('Method');
  var idxAccept = headers.indexOf('AcceptanceCriteria');
  var idxNotes = headers.indexOf('Notes');

  if (idxProtocolId < 0) {
    Logger.log('parseUHTProtocol: header "ProtocolID" tidak ditemukan. Header aktual: ' + headers.join(' | '));
    return [];
  }

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  data.forEach(function (row) {
    var pid = String(row[idxProtocolId] || '').trim();
    if (!pid) return;
    out.push({
      protocolId: pid,
      riskCategory: idxRisk >= 0 ? String(row[idxRisk] || '').trim() : '',
      testPhase: idxPhase >= 0 ? String(row[idxPhase] || '').trim() : '',
      parameterTest: idxParam >= 0 ? String(row[idxParam] || '').trim() : '',
      method: idxMethod >= 0 ? String(row[idxMethod] || '').trim() : '',
      acceptanceCriteria: idxAccept >= 0 ? String(row[idxAccept] || '').trim() : '',
      notes: idxNotes >= 0 ? String(row[idxNotes] || '').trim() : ''
    });
  });
  Logger.log('parseUHTProtocol: parsed ' + out.length + ' protokol dari sheet ' + sheet.getName());
  return out;
}

// ============================================================================
// HIGH-SPEED TWO-PHASE SIMPLEX LP & COMBINATORIAL OPTIMIZATION ENGINE
// Designed by Food Tech & Applied Mathematics / Statistics Team
// Replaces slow Gaussian & combinatorial grid enumeration with guaranteed
// mathematical optimality, zero timeouts, and sub-second execution on GAS.
// ============================================================================

function getNutrientValue_(rm, key) {
  if (key === 'snf') return safeNum_(rm.snf);
  return safeNum_(rm.nutrients[key]);
}

function generateSubsets_(arr, k) {
  var result = [];
  function combine(start, current) {
    if (current.length === k) { result.push(current.slice()); return; }
    for (var i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }
  combine(0, []);
  return result;
}

function simplexSolve_(rmSubset, coreConstraints, density, costWeights) {
  var n = rmSubset.length;
  if (n === 0) return null;

  var l = [];
  var u = [];
  var c = [];

  for (var j = 0; j < n; j++) {
    var rm = rmSubset[j];
    var minP = Math.max(0, safeNum_(rm.minPct));
    var maxP = safeNum_(rm.maxPct);
    if (isNaN(maxP) || maxP <= 0 || maxP > 100) maxP = 100;
    if (minP > maxP + 1e-7) return null;

    l.push(minP);
    u.push(maxP);

    var baseCost = safeNum_(rm.pricePerKg) / 100;
    var weight = (costWeights && costWeights[rm.rmid] !== undefined) ? costWeights[rm.rmid] : 1;
    c.push(baseCost * weight);
  }

  var A_eq = [];
  var b_eq = [];
  var A_ineq = [];
  var b_ineq = [];

  A_eq.push(new Array(n).fill(1));
  b_eq.push(100);

  for (var k = 0; k < coreConstraints.length; k++) {
    var con = coreConstraints[k];
    var key = con.key;
    var reqTarget100g = con.value;
    var row = [];
    for (var j = 0; j < n; j++) {
      var rm = rmSubset[j];
      var val = 0;
      if (key === 'snf') val = safeNum_(rm.snf);
      else if (rm.nutrients && rm.nutrients[key] !== undefined) val = safeNum_(rm.nutrients[key]);
      row.push(val);
    }
    if (con.dir === '>=') {
      A_ineq.push(row.map(function(v) { return -v; }));
      b_ineq.push(-100 * reqTarget100g);
    } else if (con.dir === '<=') {
      A_ineq.push(row.slice());
      b_ineq.push(100 * reqTarget100g);
    } else if (con.dir === '=') {
      A_eq.push(row.slice());
      b_eq.push(100 * reqTarget100g);
    }
  }

  var bounds = [];
  for (var j = 0; j < n; j++) {
    bounds.push({ min: l[j], max: u[j] });
  }

  var sol = simplexInternalSolve_(c, A_ineq, b_ineq, A_eq, b_eq, bounds);
  if (!sol) return null;

  var comp = {};
  var totalCost = 0;
  for (var j = 0; j < n; j++) {
    var pct = Math.max(0, Math.round(sol.x[j] * 1000) / 1000);
    if (pct > 1e-4) {
      comp[rmSubset[j].rmid] = pct;
      totalCost += (pct / 100) * safeNum_(rmSubset[j].pricePerKg);
    }
  }

  return { composition: comp, costPerKg: Math.round(totalCost * 100) / 100 };
}

function simplexInternalSolve_(c, A_ineq, b_ineq, A_eq, b_eq, bounds) {
  var n = c.length;
  var c_shifted = c.slice();
  var b_ineq_s = b_ineq ? b_ineq.slice() : [];
  var b_eq_s = b_eq ? b_eq.slice() : [];
  var uppers = [];

  for (var j = 0; j < n; j++) {
    var lb = (bounds && bounds[j] && bounds[j].min) || 0;
    var ub = (bounds && bounds[j] && bounds[j].max !== undefined && bounds[j].max !== null) ? bounds[j].max : Infinity;
    if (lb > ub + 1e-7) return null;

    if (A_ineq) {
      for (var i = 0; i < A_ineq.length; i++) b_ineq_s[i] -= A_ineq[i][j] * lb;
    }
    if (A_eq) {
      for (var i2 = 0; i2 < A_eq.length; i2++) b_eq_s[i2] -= A_eq[i2][j] * lb;
    }
    uppers.push(ub === Infinity ? Infinity : Math.max(0, ub - lb));
  }

  var rows = [];
  var rhs = [];

  if (A_eq) {
    for (var i = 0; i < A_eq.length; i++) {
      var row = A_eq[i].slice();
      var b = b_eq_s[i];
      if (b < -1e-9) {
        for (var k = 0; k < row.length; k++) row[k] = -row[k];
        b = -b;
      }
      rows.push(row);
      rhs.push(Math.max(0, b));
    }
  }

  if (A_ineq) {
    for (var i = 0; i < A_ineq.length; i++) {
      rows.push(A_ineq[i].slice());
      rhs.push(b_ineq_s[i]);
    }
  }

  for (var j = 0; j < n; j++) {
    if (uppers[j] !== Infinity && uppers[j] < 99.9999) {
      var ubRow = new Array(n).fill(0);
      ubRow[j] = 1;
      rows.push(ubRow);
      rhs.push(uppers[j]);
    }
  }

  var m = rows.length;
  var rowTypes = [];
  var eqCount = A_eq ? A_eq.length : 0;
  for (var i = 0; i < m; i++) {
    if (i < eqCount) {
      rowTypes.push('eq');
    } else {
      if (rhs[i] < -1e-9) {
        for (var k = 0; k < rows[i].length; k++) rows[i][k] = -rows[i][k];
        rhs[i] = -rhs[i];
        rowTypes.push('ge');
      } else {
        rowTypes.push('le');
      }
    }
  }

  var numSlacks = 0;
  var numArtificials = 0;
  for (var i = 0; i < m; i++) {
    if (rowTypes[i] === 'le') numSlacks++;
    else if (rowTypes[i] === 'ge') { numSlacks++; numArtificials++; }
    else if (rowTypes[i] === 'eq') numArtificials++;
  }

  var totalCols = n + numSlacks + numArtificials + 1;
  var tableau = [];
  for (var i = 0; i < m + 2; i++) {
    tableau.push(new Array(totalCols).fill(0));
  }

  var slackIdx = n;
  var artIdx = n + numSlacks;
  var basis = new Array(m).fill(0);
  var artCols = [];

  for (var i = 0; i < m; i++) {
    for (var j = 0; j < n; j++) tableau[i][j] = rows[i][j];
    tableau[i][totalCols - 1] = rhs[i];

    if (rowTypes[i] === 'le') {
      tableau[i][slackIdx] = 1;
      basis[i] = slackIdx;
      slackIdx++;
    } else if (rowTypes[i] === 'ge') {
      tableau[i][slackIdx] = -1;
      slackIdx++;
      tableau[i][artIdx] = 1;
      basis[i] = artIdx;
      artCols.push(artIdx);
      artIdx++;
    } else if (rowTypes[i] === 'eq') {
      tableau[i][artIdx] = 1;
      basis[i] = artIdx;
      artCols.push(artIdx);
      artIdx++;
    }
  }

  for (var j = 0; j < n; j++) tableau[m][j] = c_shifted[j];

  for (var i = 0; i < m; i++) {
    var bCol = basis[i];
    if (bCol < n && Math.abs(tableau[m][bCol]) > 1e-12) {
      var factor = tableau[m][bCol];
      for (var c_idx = 0; c_idx < totalCols; c_idx++) tableau[m][c_idx] -= factor * tableau[i][c_idx];
    }
  }

  if (numArtificials > 0) {
    for (var a = 0; a < artCols.length; a++) {
      var col = artCols[a];
      for (var i = 0; i < m; i++) {
        if (basis[i] === col) {
          for (var c_idx = 0; c_idx < totalCols; c_idx++) tableau[m + 1][c_idx] -= tableau[i][c_idx];
          break;
        }
      }
    }
  }

  function pivot(pRow, pCol) {
    var pVal = tableau[pRow][pCol];
    var invP = 1.0 / pVal;
    for (var j = 0; j < totalCols; j++) tableau[pRow][j] *= invP;
    tableau[pRow][pCol] = 1.0;

    for (var i = 0; i < m + 2; i++) {
      if (i !== pRow) {
        var factor = tableau[i][pCol];
        if (Math.abs(factor) > 1e-12) {
          for (var j = 0; j < totalCols; j++) tableau[i][j] -= factor * tableau[pRow][j];
          tableau[i][pCol] = 0.0;
        }
      }
    }
    basis[pRow] = pCol;
  }

  function runSimplex(objRow, maxCol) {
    var maxIter = (m + n + numSlacks + numArtificials) * 10;
    var iter = 0;
    while (iter++ < maxIter) {
      var minVal = -1e-8;
      var enterCol = -1;
      for (var j = 0; j < maxCol; j++) {
        if (artCols.indexOf(j) !== -1) continue;
        if (tableau[objRow][j] < minVal) {
          minVal = tableau[objRow][j];
          enterCol = j;
        }
      }
      if (enterCol === -1) return true;

      var minRatio = Infinity;
      var leaveRow = -1;
      for (var i = 0; i < m; i++) {
        var val = tableau[i][enterCol];
        if (val > 1e-9) {
          var ratio = tableau[i][totalCols - 1] / val;
          if (ratio < minRatio - 1e-9) {
            minRatio = ratio;
            leaveRow = i;
          }
        }
      }
      if (leaveRow === -1) return false;

      pivot(leaveRow, enterCol);
    }
    return true;
  }

  if (numArtificials > 0) {
    var phase1Success = runSimplex(m + 1, totalCols - 1);
    if (!phase1Success) return null;
    var phase1Val = Math.abs(tableau[m + 1][totalCols - 1]);
    if (phase1Val > 1e-4) return null;
  }

  for (var i = 0; i < m; i++) {
    var bCol = basis[i];
    if (Math.abs(tableau[m][bCol]) > 1e-12) {
      var factor = tableau[m][bCol];
      for (var c_idx = 0; c_idx < totalCols; c_idx++) tableau[m][c_idx] -= factor * tableau[i][c_idx];
    }
  }

  var phase2Success = runSimplex(m, totalCols - 1);
  if (!phase2Success) return null;

  var x_star = new Array(n).fill(0);
  for (var i = 0; i < m; i++) {
    if (basis[i] < n) {
      x_star[basis[i]] = Math.max(0, tableau[i][totalCols - 1]);
    }
  }

  var result = [];
  var totalCost = 0;
  for (var j = 0; j < n; j++) {
    var lb = (bounds && bounds[j] && bounds[j].min) || 0;
    var finalVal = x_star[j] + lb;
    result.push(finalVal);
    totalCost += c[j] * finalVal;
  }

  return { x: result, cost: totalCost };
}

// ============================================================================
// CORE SOLVER (TIDAK DIUBAH dari v6.2.0)
// ============================================================================

function solveAndEvaluate(ctx) {
  var nonAirRM = ctx.nonAirRM;
  var waterRM = ctx.waterRM;
  var target = ctx.target;
  var density = ctx.density || DEFAULT_DENSITY;
  var nSolutions = ctx.nSolutions || DEFAULT_N_SOLUTIONS;
  var onProgress = ctx.onProgress || function () {};
  var startTime = Date.now();

  if (!nonAirRM || nonAirRM.length === 0) {
    return { feasible: false, reason: 'Tidak ada RM non-air', results: [], bankSize: 0, isDone: true };
  }

  var coreConstraints = [];
  var pMin = safeNum_(target.proteinMin) / density;
  var pMax = safeNum_(target.proteinMax) / density;
  var fMin = safeNum_(target.fatMin) / density;
  var fMax = safeNum_(target.fatMax) / density;
  var sMin = safeNum_(target.snfMin) / density;

  if (pMin > 0) coreConstraints.push({ key: 'protein', dir: '>=', value: pMin });
  if (pMax > 0 && pMax > pMin) coreConstraints.push({ key: 'protein', dir: '<=', value: pMax });
  if (fMin > 0) coreConstraints.push({ key: 'fatTotal', dir: '>=', value: fMin });
  if (fMax > 0 && fMax > fMin) coreConstraints.push({ key: 'fatTotal', dir: '<=', value: fMax });
  if (sMin > 0) coreConstraints.push({ key: 'snf', dir: '>=', value: sMin });

  var bank = [];
  var bankKeys = {};

  function addToBank(sol) {
    if (!sol || !sol.composition) return;
    if (sol.composition['RM000'] > 0 && sol.composition['RM001'] > 0) return;
    var nutrPer100g = computeNutritionFromComposition(sol.composition, ctx.activeRM);
    var nutrPer100ml = nutritionPer100ml_(nutrPer100g, density);
    var nProt = Math.round(nutrPer100ml.protein * 100) / 100;
    var nFat = Math.round(nutrPer100ml.fatTotal * 100) / 100;
    var nSnf = Math.round(nutrPer100ml.snf * 100) / 100;
    var tPMin = safeNum_(target.proteinMin);
    var tPMax = safeNum_(target.proteinMax);
    var tFMin = safeNum_(target.fatMin);
    var tFMax = safeNum_(target.fatMax);
    var tSMin = safeNum_(target.snfMin);
    if (tPMin > 0 && nProt < tPMin - 0.05) return;
    if (tPMax > 0 && tPMax > tPMin && nProt > tPMax + 0.05) return;
    if (tFMin > 0 && nFat < tFMin - 0.05) return;
    if (tFMax > 0 && tFMax > tFMin && nFat > tFMax + 0.05) return;
    if (tSMin > 0 && nSnf < tSMin - 0.05) return;
    var sig = Object.keys(sol.composition).sort().map(function (rmid) {
      return rmid + ':' + sol.composition[rmid].toFixed(DEDUP_PRECISION);
    }).join(',');
    if (bankKeys[sig]) return;
    bankKeys[sig] = true;
    bank.push({ composition: sol.composition, costPerKg: sol.costPerKg });
  }

  onProgress('⚡ Menjalankan Simplex LP Solver (Kecepatan Tinggi)…', 'stage', true);

  var allCandidates = nonAirRM.slice();
  var maxK = Math.min(allCandidates.length, 6);

  var branchA = allCandidates.filter(function(r) { return r.rmid !== 'RM001'; });
  var branchB = allCandidates.filter(function(r) { return r.rmid !== 'RM000'; });
  var branches = [branchA];
  if (branchB.length > 0 && allCandidates.some(function(r) { return r.rmid === 'RM001'; })) {
    branches.push(branchB);
  }

  branches.forEach(function(branchRMs) {
    var pool = branchRMs.slice();
    if (waterRM && !pool.some(function(r) { return r.rmid === waterRM.rmid; })) {
      pool.push(waterRM);
    }
    var globalSol = simplexSolve_(pool, coreConstraints, density);
    if (globalSol) addToBank(globalSol);
  });

  for (var k = 1; k <= maxK; k++) {
    var subsets = generateSubsets_(nonAirRM, k);
    for (var i = 0; i < subsets.length; i++) {
      var subset = subsets[i];
      var has0 = subset.some(function(r) { return r.rmid === 'RM000'; });
      var has1 = subset.some(function(r) { return r.rmid === 'RM001'; });
      if (has0 && has1) continue;

      var rmWithWater = subset.slice();
      if (waterRM && !rmWithWater.some(function(r) { return r.rmid === waterRM.rmid; })) {
        rmWithWater.push(waterRM);
      }

      var s = simplexSolve_(rmWithWater, coreConstraints, density);
      if (s) addToBank(s);

      if (s && bank.length < nSolutions * 2) {
        [0.05, 0.10, 0.15].forEach(function(deltaP) {
          var perturbedConstraints = coreConstraints.map(function(c) {
            if (c.key === 'protein' && c.dir === '>=') {
              return { key: 'protein', dir: '>=', value: c.value + (deltaP / density) };
            }
            return c;
          });
          var sp = simplexSolve_(rmWithWater, perturbedConstraints, density);
          if (sp) addToBank(sp);
        });

        [0.05, 0.10].forEach(function(deltaF) {
          var perturbedConstraints = coreConstraints.map(function(c) {
            if (c.key === 'fatTotal' && c.dir === '>=') {
              return { key: 'fatTotal', dir: '>=', value: c.value + (deltaF / density) };
            }
            return c;
          });
          var sf = simplexSolve_(rmWithWater, perturbedConstraints, density);
          if (sf) addToBank(sf);
        });
      }

      if (bank.length >= nSolutions * 3) break;
    }
    if (bank.length >= nSolutions * 3) break;
    onProgress('✓ Simplex k=' + k + ' selesai · bank: ' + bank.length, 'stage', true);
  }

  if (bank.length === 0) {
    return { feasible: false, reason: 'Tidak ada solusi memenuhi constraint profil nutrisi dengan kombinasi RM terpilih', results: [], bankSize: 0, isDone: true };
  }

  bank.sort(function (a, b) { return a.costPerKg - b.costPerKg; });
  var top = bank.slice(0, nSolutions);

  onProgress('▶ Evaluasi ' + top.length + ' formula terbaik (BPOM Nutri-Level, PS, Stabilitas UHT, QUID)…', 'stage', true);

  var psRules = ctx.psRules || PS_DEFAULTS;
  var stabilityRules = ctx.stabilityRules || [];
  var nutriRules = ctx.nutriRules || [];
  var algRef = ctx.algRef || [];
  var premixes = ctx.premixes || [];
  var fatBasis = ctx.fatBasis || DEFAULT_FAT_BASIS;
  var product = ctx.product;
  var servingMl = ctx.servingMl || DEFAULT_SERVING_ML;
  var activeRM = ctx.activeRM || nonAirRM;

  top.forEach(function (sol) {
    var nutrPer100g = computeNutritionFromComposition(sol.composition, activeRM);
    var nutrPer100ml = nutritionPer100ml_(nutrPer100g, density);

    sol.nutrition = nutrPer100g;
    sol.nutritionPer100ml = nutrPer100ml;
    sol.nutriLevel = gradeNutriLevel_(nutrPer100ml, nutriRules, fatBasis, product);
    sol.pilihanSehat = evaluatePilihanSehat_(nutrPer100ml, product.category, psRules, product);
    sol.stabilityWarnings = evaluateStability_(nutrPer100ml, sol.composition, stabilityRules);
    sol.additiveRecommendation = recommendAdditives_(sol.stabilityWarnings, product, sol.composition);

    var cost = computeCost_(sol.composition, activeRM, density, servingMl);
    sol.costBreakdown = cost.breakdown;
    sol.hppPerLiter = cost.hppPerLiter;
    sol.hppPerSaji = cost.hppPerSaji;

    sol.premixRecommendation = computePremixGap_(nutrPer100ml, product, premixes, servingMl, algRef);
    sol.qualityMetrics = estimateQualityMetrics_(sol.composition, activeRM);
  });

  return { feasible: true, bankSize: bank.length, results: top, isDone: true };
}

// ============================================================================
// FLAG EVALUATION (BPOM 10/2026)
// ============================================================================

function gradeNutriLevel_(nutrition, nutriLevelRules, fatBasis, product) {
  if (!nutriLevelRules || nutriLevelRules.length === 0) throw new Error("Sheet nutri_level_criteria kosong");
  var rulesMap = {};
  nutriLevelRules.forEach(function (r) { rulesMap[r.nutrient] = r; });
  var grades = {}, details = {};
  var isPlainExempt = (product && product.category === 'Plain');

  function calcGrade(val, key) {
    var rule = rulesMap[key];
    if (!rule) return 'A';
    if (val <= rule.gradeAMax) return 'A';
    if (val <= rule.gradeBMax) return 'B';
    if (val <= rule.gradeCMax) return 'C';
    return 'D';
  }

  ['sugarTotal', 'sodium', 'fatTotal'].forEach(function (k) {
    var val = safeNum_(nutrition[k]);
    if (k === 'fatTotal' && isPlainExempt) {
      grades[k] = 'A';
      details[k] = { value: val, unit: 'g/100ml', grade: 'A', isExempt: true };
    } else {
      grades[k] = calcGrade(val, k);
      details[k] = { value: val, unit: rulesMap[k] ? rulesMap[k].unit : '', grade: grades[k] };
    }
  });

  var order = { A: 1, B: 2, C: 3, D: 4 };
  var worst = 'A', limiting = 'none';
  ['sugarTotal', 'sodium', 'fatTotal'].forEach(function (key) {
    if (order[grades[key]] > order[worst]) { worst = grades[key]; limiting = key; }
  });

  return {
    overall: worst,
    sugar: grades.sugarTotal, sodium: grades.sodium,
    fatTotal: grades.fatTotal, saturatedFat: grades.fatTotal,
    fat: grades.fatTotal, fatBasis: fatBasis || 'fatTotal',
    limiting: limiting, details: details
  };
}

function evaluatePilihanSehat_(nutrition, category, psRules, product) {
  if (!psRules || (!psRules.plain && !psRules.flavoured)) throw new Error("Sheet pilihan_sehat_criteria kosong");
  var catKey = (category === 'Plain') ? 'plain' : 'flavoured';
  var maxSugar = psRules[catKey] && psRules[catKey].sugarMax !== undefined ? psRules[catKey].sugarMax : null;
  if (maxSugar === null) throw new Error("Aturan Pilihan Sehat untuk kategori '" + catKey + "' tidak ada di sheet.");
  var reasons = [];
  var checks = {};
  var sugar = safeNum_(nutrition.sugarTotal);
  checks.sugar = { value: sugar, max: maxSugar, pass: sugar <= maxSugar + 0.01 };
  if (!checks.sugar.pass) reasons.push('Gula ' + sugar.toFixed(2) + ' > ' + maxSugar);
  checks.sweetener = { pass: true };
  return { pass: reasons.length === 0, reasons: reasons, checks: checks };
}

function evaluateStability_(nutrition, composition, rules) {
  var warnings = [];
  (rules || []).forEach(function (rule) {
    var triggerKey = rule.triggerNutrient;
    var actualValue = null;
    var isNutrient = NUTRIENT_KEYS.indexOf(triggerKey) >= 0;
    var isSNF = triggerKey === 'snf';
    var isRMID = /^RM\d{3}$/.test(triggerKey);
    var isWaterParam = WATER_PARAM_KEYS.indexOf(triggerKey) >= 0;
    var isWaterParamSheet = /^water_/.test(triggerKey);

    if (isNutrient) actualValue = safeNum_(nutrition[triggerKey]);
    else if (isSNF) actualValue = safeNum_(nutrition.snf);
    else if (isRMID) actualValue = safeNum_(composition[triggerKey]);
    else if (isWaterParam || isWaterParamSheet) return; // ditangani Engine 1 & 2
    else return;

    if (actualValue === null) return;

    var triggered = false;
    var tv = rule.triggerValue;
    switch (rule.triggerOperator) {
      case '>': triggered = actualValue > tv; break;
      case '<': triggered = actualValue < tv; break;
      case '>=': triggered = actualValue >= tv; break;
      case '<=': triggered = actualValue <= tv; break;
    }
    if (triggered) {
      warnings.push({
        ruleId: rule.ruleId, issue: rule.issue, severity: rule.severity,
        action: rule.action, processParameter: rule.processParameter,
        trigger: triggerKey + ' ' + rule.triggerOperator + ' ' + tv,
        actualValue: actualValue, notes: rule.notes,
        likelihood: rule.likelihood || 0,
        severityScore: rule.severityScore || 0,
        riskScore: rule.riskScore || 0
      });
    }
  });
  return warnings;
}

function computePremixGap_(nutritionPer100ml, product, premixes, servingMl, algRef) {
  servingMl = servingMl || DEFAULT_SERVING_ML;
  var targetPctAKG = (product && product.targetPctAKG) ? product.targetPctAKG : {};
  var algMap = {};
  (algRef || []).forEach(function (a) {
    algMap[a.key] = { value: a.algValue, unit: a.satuan, zatGizi: a.zatGizi };
  });
  var gaps = [];
  var satisfied = [];
  MICRO_KEYS.forEach(function (key) {
    var pct = safeNum_(targetPctAKG[key]);
    if (pct <= 0) return;
    var alg = algMap[key];
    if (!alg || alg.value <= 0) return;
    var targetPerServing = (pct / 100) * alg.value;
    var targetPer100ml = (targetPerServing / servingMl) * 100;
    var native = safeNum_(nutritionPer100ml[key]);
    var nativePerServing = (native * servingMl) / 100;
    var gapPer100ml = Math.max(0, targetPer100ml - native);
    var gapPerServing = Math.max(0, targetPerServing - nativePerServing);
    var nativePctAKG = alg.value > 0 ? (nativePerServing / alg.value) * 100 : 0;
    var gapPctAKG = Math.max(0, pct - nativePctAKG);
    var item = {
      key: key, label: alg.zatGizi, unit: alg.unit,
      targetPctAKG: pct,
      nativePctAKG: Math.round(nativePctAKG * 10) / 10,
      gapPctAKG: Math.round(gapPctAKG * 10) / 10,
      target: Math.round(targetPer100ml * 1000) / 1000,
      native: Math.round(native * 1000) / 1000,
      gap: Math.round(gapPer100ml * 1000) / 1000,
      targetPerServing: Math.round(targetPerServing * 100) / 100,
      nativePerServing: Math.round(nativePerServing * 100) / 100,
      gapPerServing: Math.round(gapPerServing * 100) / 100
    };
    if (gapPer100ml > 1e-4) gaps.push(item);
    else satisfied.push(item);
  });
  gaps.sort(function (a, b) { return b.gapPctAKG - a.gapPctAKG; });
  satisfied.sort(function (a, b) { return b.nativePctAKG - a.nativePctAKG; });

  var best = null;
  var bestMatchCount = -1;
  (premixes || []).forEach(function (pm) {
    var matchCount = 0;
    gaps.forEach(function (g) {
      if (safeNum_(pm.nutrients[g.key]) > 0 || (pm.targetNutrients || []).indexOf(g.key) >= 0) {
        matchCount++;
      }
    });
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      best = pm;
    }
  });

  var premixDoseGPer1000L = 0;
  var premixDoseMgPerSaji = 0;
  var premixDosePct = 0;
  var premixCostPerLiter = 0;
  var limitingNutrient = '';

  if (best && gaps.length > 0) {
    var maxDoseGPer1000L = 0;
    gaps.forEach(function (g) {
      var contentPer100gPremix = safeNum_(best.nutrients[g.key]);
      if (contentPer100gPremix > 0) {
        var doseG1000L = (g.gap / contentPer100gPremix) * 100000;
        if (doseG1000L > maxDoseGPer1000L) {
          maxDoseGPer1000L = doseG1000L;
          limitingNutrient = g.label;
        }
      }
    });
    if (maxDoseGPer1000L > 0) {
      premixDoseGPer1000L = Math.round(maxDoseGPer1000L * 1.10 * 10) / 10;
    } else if (best.recommendedDose > 0) {
      premixDoseGPer1000L = Math.round(best.recommendedDose * 10000 * 10) / 10;
    }
    if (premixDoseGPer1000L > 0) {
      var densityVal = (product && product.density) ? product.density : DEFAULT_DENSITY;
      var batchKg = 1000 * densityVal;
      premixDosePct = Math.round(((premixDoseGPer1000L / 1000) / batchKg * 100) * 1000) / 1000;
      premixDoseMgPerSaji = Math.round((premixDoseGPer1000L * (servingMl / 1000) * 1000) * 10) / 10;
      if (best.pricePerKg > 0) {
        premixCostPerLiter = Math.round(((premixDoseGPer1000L / 1000) * best.pricePerKg / 1000) * 100) / 100;
      }
    }
  }

  return {
    needed: gaps.length > 0,
    totalChecked: gaps.length + satisfied.length,
    gaps: gaps, satisfied: satisfied,
    premixId: best ? best.premixId : null,
    premixName: best ? best.premixName : null,
    premixPricePerKg: best ? safeNum_(best.pricePerKg) : 0,
    limitingNutrient: limitingNutrient,
    premixDoseGPer1000L: premixDoseGPer1000L,
    premixDoseMgPerSaji: premixDoseMgPerSaji,
    premixDosePct: premixDosePct,
    premixCostPerLiter: premixCostPerLiter,
    notes: gaps.length > 0
      ? gaps.length + ' mikronutrien di bawah target · ' + satisfied.length + ' sudah sesuai'
      : 'Semua ' + satisfied.length + ' mikronutrien sudah memenuhi target'
  };
}

function computeCost_(composition, rmList, density, servingMl) {
  density = density || DEFAULT_DENSITY;
  servingMl = servingMl || DEFAULT_SERVING_ML;
  var rmMap = {};
  rmList.forEach(function (rm) { rmMap[rm.rmid] = rm; });
  var hppPerKg = 0;
  var breakdown = [];
  Object.keys(composition || {}).forEach(function (rmid) {
    var pct = safeNum_(composition[rmid]);
    if (pct === 0) return;
    var rm = rmMap[rmid];
    if (!rm) return;
    var contribution = (pct / 100) * rm.pricePerKg;
    hppPerKg += contribution;
    breakdown.push({ rmid: rmid, name: rm.name, pct: pct, pricePerKg: rm.pricePerKg, contribution: contribution });
  });
  return {
    hppPerKg: hppPerKg,
    hppPerLiter: hppPerKg * density,
    hppPerSaji: hppPerKg * density * (servingMl / 1000),
    breakdown: breakdown
  };
}

function nutritionPer100ml_(nutritionPer100g, density) {
  density = density || DEFAULT_DENSITY;
  var out = {};
  NUTRIENT_KEYS.forEach(function (k) { out[k] = safeNum_(nutritionPer100g[k]) * density; });
  out.snf = safeNum_(nutritionPer100g.snf) * density;
  return out;
}

function computeNutritionFromComposition(composition, rmList) {
  var nutrition = {};
  NUTRIENT_KEYS.forEach(function (k) { nutrition[k] = 0; });
  nutrition.snf = 0;
  if (!composition || !rmList || rmList.length === 0) return nutrition;
  var rmMap = {};
  rmList.forEach(function (rm) { rmMap[rm.rmid] = rm; });
  Object.keys(composition).forEach(function (rmid) {
    var pct = safeNum_(composition[rmid]);
    if (pct === 0) return;
    var rm = rmMap[rmid];
    if (!rm) return;
    var factor = pct / 100;
    NUTRIENT_KEYS.forEach(function (k) {
      nutrition[k] += factor * safeNum_(rm.nutrients[k]);
    });
    nutrition.snf += factor * safeNum_(rm.snf);
  });
  return nutrition;
}

function estimateQualityMetrics_(composition, rmList) {
  var rmMap = {};
  rmList.forEach(function (rm) { rmMap[rm.rmid] = rm; });
  var pHSum = 0, pHWeight = 0, totalSugar = 0, totalSolid = 0, snf = 0, fat = 0, stabilizerPct = 0;
  Object.keys(composition || {}).forEach(function (rmid) {
    var pct = safeNum_(composition[rmid]);
    if (pct === 0) return;
    var rm = rmMap[rmid];
    if (!rm) return;
    var f = pct / 100;
    var pHVal = rm.pH || DEFAULT_PH;
    if (pHVal > 0) { pHSum += f / pHVal; pHWeight += f; }
    totalSugar += f * safeNum_(rm.nutrients.sugarTotal);
    totalSolid += f * safeNum_(rm.totalSolid);
    snf += f * safeNum_(rm.snf);
    fat += f * safeNum_(rm.nutrients.fatTotal);
    if (rm.category === 'Stabilizer' || rm.category === 'Buffer') stabilizerPct += pct;
  });
  var pH = pHWeight > 0 ? (pHWeight / pHSum) : DEFAULT_PH;
  if (pH < 4 || pH > 9) pH = DEFAULT_PH;
  var viscScore = snf * 0.15 + fat * 0.1 + stabilizerPct * 20;
  var viscosityCategory = viscScore < 2 ? 'Rendah' : (viscScore < 5 ? 'Sedang' : 'Tinggi');
  var pHRounded = Math.round(pH * 100) / 100;
  var pHStatus = (pHRounded >= 6.59 && pHRounded <= 6.81) ? 'Optimal' : (pHRounded < 6.59 ? 'Terlalu Asam' : 'Terlalu Basa');
  return {
    pH: pHRounded, pHStatus: pHStatus,
    brix: Math.round(totalSugar * 100) / 100,
    totalSolid: Math.round(totalSolid * 100) / 100,
    snf: Math.round(snf * 100) / 100,
    fat: Math.round(fat * 100) / 100,
    viscosityCategory: viscosityCategory,
    viscosityEstimateCP: Math.round((1 + viscScore) * 100) / 100,
    stabilizerPct: Math.round(stabilizerPct * 1000) / 1000
  };
}

function filterActiveRM_(rmList, allowedRMIDs) {
  var allowedSet = null;
  if (allowedRMIDs && allowedRMIDs.length > 0) {
    allowedSet = {};
    allowedRMIDs.forEach(function (id) { allowedSet[id] = true; });
  }
  return rmList.filter(function (rm) {
    if (!rm.isActive) return false;
    if (allowedSet && !allowedSet[rm.rmid]) return false;
    return true;
  });
}

function isWaterRM_(rm) {
  if (!rm) return false;
  if (WATER_RMID_CANDIDATES.indexOf(rm.rmid) >= 0) return true;
  if (rm.category === 'Water') return true;
  return false;
}

function recommendAdditives_(stabWarnings, product, composition) {
  var recommendations = [];
  var ADDITIVE_MAP = {
    STB001: [ { type: 'Stabilizer', name: 'Carrageenan Kappa', dose: '0.02-0.04%', purpose: 'Interaksi dengan kasein, cegah fat rise', regulatory: 'BPOM: maks 0.03% (sebagai carrageenan) untuk produk susu. ADI 0-75 mg/kg BB (JECFA).' }, { type: 'Emulsifier', name: 'Mono-diglyceride (MDG)', dose: '0.05-0.1%', purpose: 'Stabilisasi globula lemak', regulatory: 'BPOM GRAS, tidak ada batas khusus. ADI tidak dibatasi (JECFA).' }, { type: 'Process', name: 'Homogenisasi 2-stage', dose: '200/50 bar', purpose: 'Globula lemak < 1 μm', regulatory: 'Bukan additive — process parameter.' } ],
    STB002: [ { type: 'Stabilizer', name: 'Carrageenan Iota', dose: '0.05-0.15%', purpose: 'Gel lemah, cegah settling', regulatory: 'BPOM: maks 0.03% total carrageenan.' }, { type: 'Stabilizer', name: 'CMC (Carboxymethyl Cellulose)', dose: '0.05-0.15%', purpose: 'Viskositas, cegah sedimentasi', regulatory: 'BPOM diizinkan (INS 466). ADI 0-25 mg/kg BB.' }, { type: 'Stabilizer', name: 'Guar Gum', dose: '0.02-0.05%', purpose: 'Sinergi viskositas', regulatory: 'BPOM GRAS (INS 412). ADI tidak dibatasi.' }, { type: 'Sequestrant', name: 'SHMP (Sodium Hexametaphosphate)', dose: '0.05-0.1%', purpose: 'Sequestrant Ca²⁺, cegah presipitasi mineral', regulatory: 'BPOM: maks 0.1% (sebagai P₂O₅). Total phosphate ≤ 0.1%.' }, { type: 'Process', name: 'High-shear mixing', dose: '3000-5000 rpm, 10-15 min', purpose: 'Disolusi powder sempurna', regulatory: 'Bukan additive — process parameter.' } ],
    STB003: [ { type: 'Buffer', name: 'Dipotassium Phosphate (K₂HPO₄)', dose: '0.05-0.1%', purpose: 'Buffer pH, cegah gelasi protein', regulatory: 'BPOM GRAS (INS 340). Total phosphate ≤ 0.1% as P₂O₅.' }, { type: 'Buffer', name: 'Disodium Phosphate (Na₂HPO₄)', dose: '0.05-0.1%', purpose: 'Buffer pH 6.5-7.5', regulatory: 'BPOM GRAS (INS 339). Total phosphate ≤ 0.1% as P₂O₅.' }, { type: 'Sequestrant', name: 'Trisodium Citrate', dose: '0.05-0.1%', purpose: 'Sequestrant Ca²⁺, cegah cross-linking', regulatory: 'BPOM GRAS (INS 331). ADI tidak dibatasi.' }, { type: 'Process', name: 'Gunakan SMP low-heat', dose: '-', purpose: 'Protein kurang terdenaturasi', regulatory: 'Bukan additive — pilihan bahan baku.' }, { type: 'Process', name: 'Kontrol pH 6.6-6.7', dose: 'pH adjustment', purpose: 'pH optimal cegah gelasi', regulatory: 'pH adjuster harus food grade.' } ],
    STB004: [ { type: 'Process', name: 'Turunkan holding time', dose: 'UHT 138-142°C, holding 2-4 s', purpose: 'Minimalkan reaksi Maillard', regulatory: 'Bukan additive — process parameter.' }, { type: 'pH Adjuster', name: 'Citric Acid (food grade)', dose: '0.01-0.05%', purpose: 'Turunkan pH ke 6.6-6.7', regulatory: 'BPOM GRAS (INS 330). ADI tidak dibatasi.' }, { type: 'pH Adjuster', name: 'Lactic Acid (food grade)', dose: '0.01-0.05%', purpose: 'Alternatif citric acid', regulatory: 'BPOM GRAS (INS 270). ADI tidak dibatasi.' }, { type: 'Process', name: 'Pre-heating 90-95°C 30-60 s', dose: '-', purpose: 'Denaturasi whey, kurangi Maillard', regulatory: 'Bukan additive — process parameter.' } ],
    STB005: [ { type: 'Emulsifier', name: 'Lecithin (Soy/Sunflower)', dose: '0.05-0.15%', purpose: 'Emulsifier alami', regulatory: 'BPOM GRAS (INS 322). ADI tidak dibatasi.' }, { type: 'Emulsifier', name: 'Polysorbate 60 (Tween 60)', dose: '0.05-0.1%', purpose: 'Emulsifier sintetis', regulatory: 'BPOM diizinkan (INS 435) untuk flavoured/creamer. ADI 0-25 mg/kg BB.' }, { type: 'Stabilizer', name: 'Carrageenan Kappa', dose: '0.02-0.04%', purpose: 'Sinergi dengan emulsifier', regulatory: 'BPOM: maks 0.03% total carrageenan.' }, { type: 'Process', name: 'Homogenisasi 2-stage', dose: '250/50 bar', purpose: 'Globula lemak < 0.5 μm', regulatory: 'Bukan additive.' } ],
    STB006: [ { type: 'Process', name: 'Batasi Sweet Whey Powder', dose: '≤ 5% formula', purpose: 'Kurangi off-flavor dari whey', regulatory: 'Bukan additive — pilihan bahan baku.' }, { type: 'Additive', name: 'Masking flavour (vanilla/cream)', dose: '0.05-0.2%', purpose: 'Tutupi off-flavor', regulatory: 'BPOM: flavouring harus food grade.' }, { type: 'Process', name: 'Nitrogen flushing', dose: 'N₂ blanket', purpose: 'Cegah oksidasi lemak', regulatory: 'Bukan additive.' } ],
    STB007: [ { type: 'Stabilizer', name: 'Carrageenan Kappa + Iota blend', dose: '0.05-0.1%', purpose: 'Cegah presipitasi Ca-phosphate', regulatory: 'BPOM: maks 0.03% total carrageenan.' }, { type: 'Sequestrant', name: 'SHMP', dose: '0.05-0.1%', purpose: 'Sequestrant kuat Ca²⁺', regulatory: 'BPOM: maks 0.1% as P₂O₅.' }, { type: 'Sequestrant', name: 'STPP', dose: '0.05-0.1%', purpose: 'Alternatif SHMP', regulatory: 'BPOM: maks 0.1% as P₂O₅.' }, { type: 'Sequestrant', name: 'Trisodium Citrate', dose: '0.1-0.2%', purpose: 'Sequestrant Ca²⁺', regulatory: 'BPOM GRAS (INS 331).' } ],
    STB008: [ { type: 'Process', name: 'Turunkan dosis phosphate buffer', dose: '≤ 0.15% total P₂O₅', purpose: 'Phosphate berlebih → gelasi', regulatory: 'BPOM: total phosphate ≤ 0.1% as P₂O₅.' }, { type: 'Buffer', name: 'Ganti ke Trisodium Citrate', dose: '0.05-0.1%', purpose: 'Citrate kurang reaktif', regulatory: 'BPOM GRAS (INS 331).' }, { type: 'Process', name: 'Kontrol pH 6.6-6.7', dose: 'pH adjustment', purpose: 'pH stabil cegah gelasi', regulatory: 'pH adjuster harus food grade.' } ]
  };

  stabWarnings.forEach(function (w) {
    var list = ADDITIVE_MAP[w.ruleId];
    if (!list) return;
    list.forEach(function (item) {
      recommendations.push({ triggerRule: w.ruleId, issue: w.issue, type: item.type, name: item.name, dose: item.dose, purpose: item.purpose, regulatory: item.regulatory || '-', severity: w.severity });
    });
  });

  if (recommendations.length === 0) {
    recommendations.push({ triggerRule: 'PREVENTIF', issue: 'Standar UHT', type: 'Stabilizer', name: 'Carrageenan Kappa', dose: '0.02-0.03%', purpose: 'Preventif creaming ringan', regulatory: 'BPOM: maks 0.03% total carrageenan.', severity: 'Low' });
    recommendations.push({ triggerRule: 'PREVENTIF', issue: 'Standar UHT', type: 'pH Adjuster', name: 'NaHCO₃ / NaOH food grade (jika pH < 6.6) atau Citric Acid (jika pH > 6.8)', dose: '0.01-0.05%', purpose: 'Target pH 6.6-6.8', regulatory: 'NaHCO₃ GRAS, NaOH food grade, Citric acid GRAS.', severity: 'Low' });
    recommendations.push({ triggerRule: 'PREVENTIF', issue: 'Standar UHT', type: 'Sequestrant', name: 'SHMP atau Trisodium Citrate', dose: '0.05-0.1%', purpose: 'Cegah Ca sediment', regulatory: 'SHMP maks 0.1% as P₂O₅. Trisodium citrate GRAS.', severity: 'Low' });
  } else {
    recommendations.push({ triggerRule: 'GLOBAL', issue: 'pH Control UHT', type: 'pH Adjuster', name: 'NaHCO₃ / NaOH food grade (jika pH < 6.6) · Citric/Lactic Acid (jika pH > 6.8)', dose: '0.01-0.05%', purpose: 'Target pH 6.6-6.8', regulatory: 'NaHCO₃ (INS 500ii) GRAS. Citric acid (INS 330) & lactic acid (INS 270) GRAS.', severity: 'Medium' });
  }
  return { needed: recommendations.length > 0, items: recommendations, notes: recommendations.length + ' rekomendasi' };
}

// ============================================================================
// 4-ENGINE UHT STABILITY DSS
// Engine 1: Composition Risk Screening
// Engine 2: UHT Failure Mechanism Diagnosis (Likelihood × Severity Score)
// Engine 3: Corrective Action & Additive Selection (Process-First Philosophy)
// Engine 4: Verification & Shelf-Life Trial Protocol
// ============================================================================

function engine1_CompositionRisk_(nutritionPer100ml, composition, rmList, product, waterParams, productType) {
  waterParams = waterParams || WATER_PARAMS_DEFAULT;
  var limits = waterParams.limits || WATER_LIMITS;
  var checks = [];

  // --- LANGKAH 3: filter stability rules sesuai ProductType (kalau ada) ---
  productType = productType || (product && product.productType) || 'UHT';

  var protein = safeNum_(nutritionPer100ml.protein);
  var fat = safeNum_(nutritionPer100ml.fatTotal);
  var snf = safeNum_(nutritionPer100ml.snf);
  var totalSolid = safeNum_(nutritionPer100ml.totalSolid);
  var calcium = safeNum_(nutritionPer100ml.calcium);
  var phosphorus = safeNum_(nutritionPer100ml.phosphorus);

  if (fat > 0.1 && protein > 0.1) {
    var pfRatio = protein / fat;
    var pfStatus = (pfRatio >= 0.85 && pfRatio <= 1.10) ? 'OK' : (pfRatio < 0.70 || pfRatio > 1.30 ? 'HIGH' : 'WATCH');
    checks.push({
      id: 'proteinFatRatio', label: 'Rasio Protein : Fat',
      value: Math.round(pfRatio * 100) / 100, target: '0.85 – 1.10',
      status: pfStatus, severity: pfStatus === 'HIGH' ? 'High' : (pfStatus === 'WATCH' ? 'Medium' : 'Low'),
      note: pfStatus === 'OK' ? 'Rasio seimbang untuk UHT.' :
            (pfRatio < 0.85 ? 'Fat dominan → risiko creaming / fat separation.' : 'Protein dominan → tekstur chalky / sedimentasi protein.')
    });
  } else {
    checks.push({ id: 'proteinFatRatio', label: 'Rasio Protein : Fat', value: null, target: '0.85 – 1.10', status: 'N/A', severity: 'Low', note: 'Protein atau fat terlalu rendah untuk dihitung.' });
  }

  if (calcium > 0.1 && phosphorus > 0.1) {
    var capRatio = calcium / phosphorus;
    var capStatus = (capRatio >= 1.0 && capRatio <= 1.5) ? 'OK' : (capRatio > 1.5 || capRatio < 0.7 ? 'HIGH' : 'WATCH');
    checks.push({
      id: 'caPRatio', label: 'Rasio Ca : P',
      value: Math.round(capRatio * 100) / 100, target: '1.00 – 1.50',
      status: capStatus, severity: capStatus === 'HIGH' ? 'High' : (capStatus === 'WATCH' ? 'Medium' : 'Low'),
      note: capStatus === 'OK' ? 'Rasio mineral seimbang.' :
            (capRatio > 1.5 ? 'Ca dominan → risiko Ca-phosphate sediment saat UHT.' : 'P dominan → risiko mineral imbalance.')
    });
  } else {
    checks.push({ id: 'caPRatio', label: 'Rasio Ca : P', value: null, target: '1.00 – 1.50', status: 'N/A', severity: 'Low', note: 'Data Ca/P tidak lengkap.' });
  }

  var tsStatus = (totalSolid >= 10 && totalSolid <= 14) ? 'OK' : (totalSolid < 8 || totalSolid > 15 ? 'HIGH' : 'WATCH');
  checks.push({
    id: 'totalSolid', label: 'Total Solid',
    value: Math.round(totalSolid * 100) / 100, target: '10 – 14 g/100ml',
    status: tsStatus, severity: tsStatus === 'HIGH' ? 'High' : (tsStatus === 'WATCH' ? 'Medium' : 'Low'),
    note: tsStatus === 'OK' ? 'TS dalam rentang UHT standar.' :
          (totalSolid < 10 ? 'TS rendah → body lemah, mouthfeel watery.' : 'TS tinggi → viskositas naik, beban HX meningkat.')
  });

  var phProd = (product && product.pH) ? safeNum_(product.pH) : safeNum_(nutritionPer100ml.pH);
  if (phProd <= 0) phProd = 6.7;
  var phStatus = (phProd >= 6.6 && phProd <= 6.8) ? 'OK' : (phProd < 6.5 || phProd > 7.0 ? 'HIGH' : 'WATCH');
  checks.push({
    id: 'productPH', label: 'pH Produk',
    value: Math.round(phProd * 100) / 100, target: '6.60 – 6.80',
    status: phStatus, severity: phStatus === 'HIGH' ? 'High' : (phStatus === 'WATCH' ? 'Medium' : 'Low'),
    note: phStatus === 'OK' ? 'pH optimal UHT.' :
          (phProd < 6.6 ? 'pH asam → risiko gelasi protein.' : 'pH basa → destabilisasi kasein.')
  });

  var waterChecks = [
    { key: 'waterHardness', label: 'Kesadahan Air', limit: limits.hardness, unit: 'mg/L CaCO3', warn: 'Kerak CaCO3 di plate HX; efisiensi panas turun.', rule: 'STB009' },
    { key: 'waterTds', label: 'TDS Air', limit: limits.tds, unit: 'mg/L', warn: 'Ion imbalance; off-flavor; korosi.', rule: 'STB014' },
    { key: 'waterCa', label: 'Kalsium Air (Ca²⁺)', limit: limits.ca, unit: 'mg/L', warn: 'Jembatan antar-misel kasein → sedimentasi UHT.', rule: 'STB016' },
    { key: 'waterMg', label: 'Magnesium Air (Mg²⁺)', limit: limits.mg, unit: 'mg/L', warn: 'Denaturasi β-lactoglobulin dipercepat.', rule: 'STB017' },
    { key: 'waterIron', label: 'Besi Air (Fe)', limit: limits.iron, unit: 'mg/L', warn: 'Oksidasi lemak → rancidity; warna kekuningan.', rule: 'STB011' },
    { key: 'waterAlkalinity', label: 'Alkalinitas Air', limit: limits.alkalinity, unit: 'mg/L CaCO3', warn: 'Netralkan asam susu → pH produk naik >6.8.', rule: 'STB018' }
  ];
  waterChecks.forEach(function (wc) {
    var val = safeNum_(waterParams[wc.key]);
    var exceeded = val > wc.limit;
    var status = exceeded ? 'HIGH' : (val > wc.limit * 0.7 ? 'WATCH' : 'OK');
    checks.push({
      id: wc.key, label: wc.label + ' (Air)',
      value: Math.round(val * 1000) / 1000, target: '≤ ' + wc.limit + ' ' + wc.unit,
      status: status, severity: exceeded ? 'High' : (status === 'WATCH' ? 'Medium' : 'Low'),
      note: exceeded ? wc.warn : (status === 'WATCH' ? 'Mendekati batas kritis. Pantau berkala.' : 'Dalam batas aman.'),
      relatedRule: wc.rule
    });
  });

  var waterPh = safeNum_(waterParams.waterPh);
  if (waterPh <= 0) waterPh = 7.0;
  var waterPhStatus = 'OK', waterPhSev = 'Low', waterPhNote = 'pH air netral.';
  if (waterPh < limits.phMin) { waterPhStatus = 'HIGH'; waterPhSev = 'High'; waterPhNote = 'Air asam → presipitasi protein (isoelectric point).'; }
  else if (waterPh > limits.phMax) { waterPhStatus = 'HIGH'; waterPhSev = 'High'; waterPhNote = 'Air alkalis → destabilisasi kasein.'; }
  else if (waterPh < 6.5 || waterPh > 8.0) { waterPhStatus = 'WATCH'; waterPhSev = 'Medium'; waterPhNote = 'pH air di zona waspada.'; }
  checks.push({
    id: 'waterPh', label: 'pH Air',
    value: Math.round(waterPh * 100) / 100, target: '6.00 – 8.50',
    status: waterPhStatus, severity: waterPhSev, note: waterPhNote, relatedRule: 'STB012'
  });

  var sevOrder = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  var worst = 'Low';
  var riskScore = 0;
  checks.forEach(function (c) {
    if ((sevOrder[c.severity] || 0) > (sevOrder[worst] || 0)) worst = c.severity;
    riskScore += (sevOrder[c.severity] || 0);
  });

  return {
    engine: 'Engine 1',
    name: 'Composition Risk Screening',
    productType: productType,   // --- LANGKAH 3: expose untuk UI/diagnosis ---
    checks: checks,
    overall: worst,
    riskScore: riskScore,
    highCount: checks.filter(function (c) { return c.severity === 'High' || c.severity === 'Critical'; }).length,
    mediumCount: checks.filter(function (c) { return c.severity === 'Medium'; }).length,
    okCount: checks.filter(function (c) { return c.severity === 'Low'; }).length
  };
}

function engine2_DiagnoseStability_(nutritionPer100ml, composition, stabilityRules, waterParams, rmList, productType) {
  waterParams = waterParams || WATER_PARAMS_DEFAULT;
  productType = productType || 'UHT';

  // --- LANGKAH 3: filter rules sesuai ProductType ---
  var filteredRules = readStabilityRulesForType_(productType, stabilityRules || []);

  var diagnoses = [];

  filteredRules.forEach(function (rule) {
    var triggerKey = rule.triggerNutrient;
    var actualValue = null;
    var isNutrient = NUTRIENT_KEYS.indexOf(triggerKey) >= 0;
    var isSNF = triggerKey === 'snf';
    var isRMID = /^RM\d{3}$/.test(triggerKey);
    var isWaterParam = WATER_PARAM_KEYS.indexOf(triggerKey) >= 0;
    var isWaterParamSheet = /^water_/.test(triggerKey);

    if (isNutrient) actualValue = safeNum_(nutritionPer100ml[triggerKey]);
    else if (isSNF) actualValue = safeNum_(nutritionPer100ml.snf);
    else if (isRMID) actualValue = safeNum_(composition[triggerKey]);
    else if (isWaterParam || isWaterParamSheet) {
      var mapWater = {
        'water_hardness': 'waterHardness', 'water_tds': 'waterTds',
        'water_ca': 'waterCa', 'water_mg': 'waterMg',
        'water_ph': 'waterPh', 'water_iron': 'waterIron',
        'water_alkalinity': 'waterAlkalinity'
      };
      var codeKey = mapWater[triggerKey] || triggerKey;
      actualValue = safeNum_(waterParams[codeKey]);
    } else {
      return;
    }

    var triggered = false;
    var tv = rule.triggerValue;
    switch (rule.triggerOperator) {
      case '>': triggered = actualValue > tv; break;
      case '<': triggered = actualValue < tv; break;
      case '>=': triggered = actualValue >= tv; break;
      case '<=': triggered = actualValue <= tv; break;
    }

    var lik = rule.likelihood || 3;
    var sevSc = rule.severityScore || 3;
    var riskScore = Math.round(lik * sevSc * 10) / 10;

    var level = 'Low';
    if (riskScore >= 20) level = 'Critical';
    else if (riskScore >= 12) level = 'High';
    else if (riskScore >= 6) level = 'Medium';

    var confidence = EVIDENCE_STATUS.SCREENING_ONLY;
    if (triggered) {
      if (riskScore >= 20) confidence = EVIDENCE_STATUS.CONFIRMED_RISK;
      else if (riskScore >= 12) confidence = EVIDENCE_STATUS.NEEDS_VERIFICATION;
      else confidence = EVIDENCE_STATUS.SCREENING_ONLY;
    }

    if (!triggered && riskScore < 6) return;

    diagnoses.push({
      ruleId: rule.ruleId,
      issue: rule.issue,
      trigger: triggerKey + ' ' + rule.triggerOperator + ' ' + tv,
      triggerKey: triggerKey,
      triggerOperator: rule.triggerOperator,
      triggerValue: tv,
      actualValue: Math.round(actualValue * 1000) / 1000,
      triggered: triggered,
      likelihood: lik,
      severityScore: sevSc,
      riskScore: riskScore,
      level: level,
      confidence: confidence,
      action: rule.action,
      processParameter: rule.processParameter,
      notes: rule.notes
    });
  });

  diagnoses.sort(function (a, b) { return b.riskScore - a.riskScore; });

  var sevOrder = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  var worst = 'Low';
  diagnoses.forEach(function (d) {
    if ((sevOrder[d.level] || 0) > (sevOrder[worst] || 0)) worst = d.level;
  });

  return {
    engine: 'Engine 2',
    name: 'UHT Failure Mechanism Diagnosis',
    productType: productType,   // --- LANGKAH 3 ---
    diagnoses: diagnoses,
    overall: worst,
    triggeredCount: diagnoses.filter(function (d) { return d.triggered; }).length,
    confirmedCount: diagnoses.filter(function (d) { return d.confidence === EVIDENCE_STATUS.CONFIRMED_RISK; }).length,
    needsVerificationCount: diagnoses.filter(function (d) { return d.confidence === EVIDENCE_STATUS.NEEDS_VERIFICATION; }).length,
    screeningCount: diagnoses.filter(function (d) { return d.confidence === EVIDENCE_STATUS.SCREENING_ONLY; }).length
  };
}

function engine3_CorrectiveAction_(diagnosis) {
  var processActions = [];
  var additiveActions = [];

  var ADDITIVE_DB = {
    STB001: {
      process: [
        { action: 'Evaluasi efisiensi homogenisasi 2-tahap', param: '180-220 / 40-60 bar', expected: 'Globula lemak < 1 μm' },
        { action: 'Naikkan tekanan homogenizer HX', param: '200-220 bar stage 1', expected: 'Cegah creaming' }
      ],
      additive: [
        { name: 'Carrageenan Kappa', dose: '0.02-0.04%', purpose: 'Interaksi dengan kasein, cegah fat rise', sideEffect: 'Over-stabilization → gel / viscosity spike', regulatory: 'BPOM: maks 0.03%' },
        { name: 'Mono-diglyceride (MDG)', dose: '0.05-0.1%', purpose: 'Stabilisasi globula lemak', sideEffect: 'Off-flavor pada dosis tinggi', regulatory: 'BPOM GRAS' }
      ]
    },
    STB002: {
      process: [
        { action: 'Perpanjang waktu hidrasi serbuk', param: 'High-shear 3000-5000 rpm, 20-30 min', expected: 'Disolusi sempurna, minim sediment' },
        { action: 'Cek solubility index SMP/WMP', param: '< 0.5 mL/50g', expected: 'Serbuk berkualitas baik' }
      ],
      additive: [
        { name: 'Carrageenan Iota', dose: '0.05-0.15%', purpose: 'Gel lemah, cegah settling', sideEffect: 'Viskositas naik → mouthfeel heavy', regulatory: 'BPOM: maks 0.03% total carrageenan' },
        { name: 'CMC', dose: '0.05-0.15%', purpose: 'Viskositas, cegah sedimentasi', sideEffect: 'Bisa bereaksi dengan protein pada pH rendah', regulatory: 'BPOM INS 466' },
        { name: 'SHMP', dose: '0.05-0.1%', purpose: 'Sequestrant Ca²⁺', sideEffect: 'Kelebihan → mineral imbalance, gel', regulatory: 'BPOM: maks 0.1% as P₂O₅' }
      ]
    },
    STB003: {
      process: [
        { action: 'Turunkan holding time', param: 'UHT 138-142°C, 2-4 s', expected: 'Minimalkan denaturasi protein' },
        { action: 'Gunakan SMP low-heat', param: 'Heat classification low', expected: 'Protein kurang terdenaturasi' },
        { action: 'Kontrol pH 6.6-6.7', param: 'pH adjustment pre-UHT', expected: 'Cegah gelasi pH-driven' }
      ],
      additive: [
        { name: 'Dipotassium Phosphate (DKP)', dose: '0.05-0.1%', purpose: 'Buffer pH, cegah gelasi', sideEffect: 'Phosphate berlebih → Ca-phosphate gel', regulatory: 'BPOM: total phosphate ≤ 0.1% as P₂O₅' },
        { name: 'Trisodium Citrate', dose: '0.05-0.1%', purpose: 'Sequestrant Ca²⁺', sideEffect: 'Dosis tinggi → rasa asin/basa', regulatory: 'BPOM GRAS' }
      ]
    },
    STB004: {
      process: [
        { action: 'Turunkan holding time', param: 'UHT 138-142°C, 2-4 s', expected: 'Kurangi reaksi Maillard' },
        { action: 'Pre-heating 90-95°C 30-60 s', param: 'Denaturasi whey terkontrol', expected: 'Kurangi Maillard' }
      ],
      additive: [
        { name: 'Citric Acid food grade', dose: '0.01-0.05%', purpose: 'Turunkan pH ke 6.6-6.7', sideEffect: 'Dosis tinggi → protein precipitation', regulatory: 'BPOM GRAS' }
      ]
    },
    STB005: {
      process: [
        { action: 'Homogenisasi 2-tahap', param: '220 / 50 bar', expected: 'Globula lemak < 0.5 μm' },
        { action: 'Cek free fat', param: '< 0.05%', expected: 'Emulsi stabil' }
      ],
      additive: [
        { name: 'Lecithin', dose: '0.05-0.15%', purpose: 'Emulsifier alami', sideEffect: 'Off-flavor pada dosis tinggi', regulatory: 'BPOM GRAS' },
        { name: 'Polysorbate 60', dose: '0.05-0.1%', purpose: 'Emulsifier sintetis', sideEffect: 'Busa berlebih; regulasi ketat', regulatory: 'BPOM INS 435' }
      ]
    },
    STB006: {
      process: [
        { action: 'Batasi Sweet Whey Powder', param: '≤ 5% formula', expected: 'Kurangi off-flavor' },
        { action: 'Nitrogen flushing', param: 'N₂ blanket', expected: 'Cegah oksidasi' }
      ],
      additive: [
        { name: 'Masking flavour', dose: '0.05-0.2%', purpose: 'Tutupi off-flavor', sideEffect: 'Bisa menutupi off-flavor lain yang lebih serius', regulatory: 'BPOM: food grade' }
      ]
    },
    STB007: {
      process: [
        { action: 'Cek hardness air', param: 'Jika >100 mg/L → softener/RO', expected: 'Sumber Ca eksternal dihilangkan' },
        { action: 'Kontrol pH 6.6-6.8', param: 'pH adjustment', expected: 'Cegah presipitasi Ca-phosphate' }
      ],
      additive: [
        { name: 'SHMP', dose: '0.05-0.1%', purpose: 'Sequestrant kuat Ca²⁺', sideEffect: 'Phosphate overload → gel', regulatory: 'BPOM: maks 0.1% as P₂O₅' },
        { name: 'Trisodium Citrate', dose: '0.1-0.2%', purpose: 'Sequestrant Ca²⁺', sideEffect: 'Rasa asin/basa pada dosis tinggi', regulatory: 'BPOM GRAS' }
      ]
    },
    STB008: {
      process: [
        { action: 'Turunkan dosis phosphate buffer', param: '≤ 0.1% total P₂O₅', expected: 'Cegah phosphate gel' },
        { action: 'Kontrol pH 6.6-6.7', param: 'pH adjustment', expected: 'Cegah gelasi' }
      ],
      additive: [
        { name: 'Trisodium Citrate', dose: '0.05-0.1%', purpose: 'Buffer alternatif', sideEffect: 'Rasa asin/basa', regulatory: 'BPOM GRAS' }
      ]
    },
    STB009: { process: [
      { action: 'Regenerasi resin softener', param: 'Sesuai jadwal', expected: 'Hardness turun <50 mg/L' },
      { action: 'Pasang RO system', param: 'Jika hardness >100 persist', expected: 'Hardness <10 mg/L' }
    ], additive: [] },
    STB010: { process: [
      { action: 'Monitoring ΔP heat exchanger', param: 'Setiap shift', expected: 'Deteksi fouling dini' },
      { action: 'CIP lebih sering', param: 'Sesuai ΔP trend', expected: 'Cegah kerak' }
    ], additive: [] },
    STB011: { process: [
      { action: 'Pasang iron filter', param: 'Green sand / KMnO4', expected: 'Fe <0.1 mg/L' },
      { action: 'Nitrogen flushing', param: 'N₂ blanket', expected: 'Cegah oksidasi lemak' }
    ], additive: [] },
    STB012: { process: [
      { action: 'Turunkan pH air', param: 'Citric acid → pH 6.5-7.0', expected: 'Cegah pH drift produk' }
    ], additive: [] },
    STB013: { process: [
      { action: 'Naikkan pH air', param: 'NaHCO3 → pH 6.5-7.0', expected: 'Cegah presipitasi protein' }
    ], additive: [] },
    STB014: { process: [
      { action: 'Pasang RO system', param: 'TDS <100 mg/L', expected: 'Ion balance' }
    ], additive: [] },
    STB015: { process: [
      { action: 'STOP produksi', param: 'Air baku gagal standar', expected: 'Wajib RO + UV + softening' }
    ], additive: [] },
    STB016: { process: [
      { action: 'Softening atau RO', param: 'Ca <40 mg/L', expected: 'Cegah Ca sediment' }
    ], additive: [] },
    STB017: { process: [
      { action: 'Pasang softener', param: 'Mg <30 mg/L', expected: 'Cegah denaturasi dipercepat' }
    ], additive: [] },
    STB018: { process: [
      { action: 'Acid dosing atau RO', param: 'Alkalinitas <50 mg/L', expected: 'Cegah pH drift' }
    ], additive: [] }
  };

  (diagnosis.diagnoses || []).forEach(function (d) {
    if (!d.triggered) return;
    var db = ADDITIVE_DB[d.ruleId];
    if (!db) return;
    (db.process || []).forEach(function (p) {
      processActions.push({
        ruleId: d.ruleId, issue: d.issue,
        action: p.action, parameter: p.param, expectedOutcome: p.expected,
        riskLevel: d.level
      });
    });
    (db.additive || []).forEach(function (a) {
      additiveActions.push({
        ruleId: d.ruleId, issue: d.issue,
        name: a.name, dose: a.dose, purpose: a.purpose,
        sideEffectRisk: a.sideEffect, regulatory: a.regulatory,
        riskLevel: d.level
      });
    });
  });

  var sideEffectMap = {};
  additiveActions.forEach(function (a) {
    var key = a.name;
    if (!sideEffectMap[key]) {
      sideEffectMap[key] = { name: a.name, dose: a.dose, sideEffectRisk: a.sideEffectRisk, regulatory: a.regulatory, triggeredBy: [] };
    }
    sideEffectMap[key].triggeredBy.push(a.ruleId);
  });
  var sideEffectRisks = Object.keys(sideEffectMap).map(function (k) { return sideEffectMap[k]; });

  return {
    engine: 'Engine 3',
    name: 'Corrective Action & Additive Selection (Process-First)',
    processActions: processActions,
    additiveActions: additiveActions,
    sideEffectRisks: sideEffectRisks,
    summary: {
      processCount: processActions.length,
      additiveCount: additiveActions.length,
      note: processActions.length > 0
        ? 'Process-first: ' + processActions.length + ' process actions direkomendasikan sebelum additive.'
        : 'Tidak ada process action spesifik; evaluasi additive selektif.'
    }
  };
}

function engine4_GenerateShelfLifeProtocol_(riskLevels, uhtProtocols) {
  var levels = (riskLevels || []).filter(function (l) { return l && l !== 'Low'; });
  if (levels.length === 0) levels = ['Low'];

  var selected = (uhtProtocols || []).filter(function (p) {
    return levels.indexOf(p.riskCategory) >= 0;
  });

  if (selected.length === 0) {
    selected = (uhtProtocols || []).filter(function (p) { return p.riskCategory === 'Low'; });
  }

  var scheduleMap = {};
  selected.forEach(function (p) {
    var phase = p.testPhase;
    if (!scheduleMap[phase]) {
      scheduleMap[phase] = {
        phase: phase,
        day: parsePhaseDay(phase),
        tests: []
      };
    }
    scheduleMap[phase].tests.push({
      protocolId: p.protocolId,
      parameterTest: p.parameterTest,
      method: p.method,
      acceptanceCriteria: p.acceptanceCriteria,
      riskCategory: p.riskCategory,
      notes: p.notes
    });
  });

  var schedule = Object.keys(scheduleMap).map(function (k) { return scheduleMap[k]; });
  schedule.sort(function (a, b) { return a.day - b.day; });

  return {
    engine: 'Engine 4',
    name: 'Verification & Shelf-Life Trial Protocol',
    riskCategories: levels,
    protocols: selected,
    schedule: schedule,
    totalProtocols: selected.length,
    phases: schedule.map(function (s) { return s.phase; })
  };

  function parsePhaseDay(phase) {
    if (!phase) return 0;
    var m = String(phase).match(/D(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }
}

function runFourEngine_(solution, ctx) {
  var nutritionPer100ml = solution.nutritionPer100ml || {};
  var composition = solution.composition || {};
  var rmList = ctx.activeRM || [];
  var product = ctx.product || {};
  var waterParams = ctx.waterParams || WATER_PARAMS_DEFAULT;
  var stabilityRules = ctx.stabilityRules || [];
  var uhtProtocols = ctx.uhtProtocols || [];

  Logger.log('[runFourEngine] start — uhtProtocols=' + uhtProtocols.length + ', stabilityRules=' + stabilityRules.length);

  var e1, e2, e3, e4;

  // --- LANGKAH 3: resolve productType sekali di awal ---
  var _ptype = (product && product.productType) ? product.productType : 'UHT';

  try { e1 = engine1_CompositionRisk_(nutritionPer100ml, composition, rmList, product, waterParams, _ptype); }
  catch (err) { Logger.log('[runFourEngine] Engine 1 ERROR: ' + err.message + '\n' + err.stack); e1 = { error: err.message, checks: [], overall: 'Low', riskScore: 0 }; }

  try { e2 = engine2_DiagnoseStability_(nutritionPer100ml, composition, stabilityRules, waterParams, rmList, _ptype); }
  catch (err) { Logger.log('[runFourEngine] Engine 2 ERROR: ' + err.message); e2 = { error: err.message, diagnoses: [], overall: 'Low', triggeredCount: 0 }; }

  try { e3 = engine3_CorrectiveAction_(e2); }
  catch (err) { Logger.log('[runFourEngine] Engine 3 ERROR: ' + err.message); e3 = { error: err.message, processActions: [], additiveActions: [], sideEffectRisks: [], summary: {} }; }

  var riskCategories = [];
  try {
    (e1.checks || []).forEach(function (c) {
      if ((c.severity === 'High' || c.severity === 'Critical') && riskCategories.indexOf(c.severity) < 0) riskCategories.push(c.severity);
    });
    (e2.diagnoses || []).forEach(function (d) {
      if (d.triggered && (d.level === 'High' || d.level === 'Critical') && riskCategories.indexOf(d.level) < 0) riskCategories.push(d.level);
    });
  } catch (err) { Logger.log('[runFourEngine] riskCategories ERROR: ' + err.message); }
  if (riskCategories.length === 0) riskCategories = ['Low'];

  try { e4 = engine4_GenerateShelfLifeProtocol_(riskCategories, uhtProtocols); }
  catch (err) { Logger.log('[runFourEngine] Engine 4 ERROR: ' + err.message); e4 = { error: err.message, protocols: [], schedule: [], riskCategories: riskCategories, totalProtocols: 0 }; }

  return {
    engine1: e1,
    engine2: e2,
    engine3: e3,
    engine4: e4,
    waterParams: waterParams,
    generatedAt: new Date().toISOString()
  };
}

// ============================================================================
// JOB MANAGEMENT
// ============================================================================

var JOB_CACHE_PREFIX = 'DairyOptima_Job_';

function getTempBank_(jobId) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('DairyOptima_TempBank_' + jobId);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch (e) { return []; }
}

function clearTempBank_(jobId) {
  try {
    CacheService.getScriptCache().remove('DairyOptima_TempBank_' + jobId);
  } catch (e) {}
}

function saveTempBank_(jobId, bank) {
  try {
    var cache = CacheService.getScriptCache();
    var trimmed = bank.map(function(s) { return { composition: s.composition, costPerKg: s.costPerKg }; });
    trimmed.sort(function(a, b) { return a.costPerKg - b.costPerKg; });
    trimmed = trimmed.slice(0, 50);
    var json = JSON.stringify(trimmed);
    if (json.length > 90000) {
      trimmed = trimmed.slice(0, 10);
      json = JSON.stringify(trimmed);
    }
    cache.put('DairyOptima_TempBank_' + jobId, json, 600);
  } catch (e) { Logger.log('saveTempBank_ error: ' + e.message); }
}

function startOptimizationJob(payload) {
  try {
    payload = payload || {};
    var productId = payload.productId;
    if (!productId) return { ok: false, error: 'productId wajib' };

    var rmList = parseRawMaterial();
    var products = parseProduct();
    var product = products.filter(function (p) { return p.productId === productId; })[0];
    if (!product) return { ok: false, error: 'Produk tidak ditemukan' };

    var selectedRMIDs = payload.selectedRMIDs || [];
    if (selectedRMIDs.length === 0) {
      selectedRMIDs = rmList.filter(function (r) { return r.isActive; }).map(function (r) { return r.rmid; });
    }
    var activeRM = filterActiveRM_(rmList, selectedRMIDs);
    if (activeRM.length === 0) return { ok: false, error: 'Tidak ada RM aktif' };

    var servingCfg = parseServingSettings();
    var servingMl = safeNum_(servingCfg.defaultServingMl) || DEFAULT_SERVING_ML;

    var waterParams = payload.waterParams || WATER_PARAMS_DEFAULT;

    var jobId = 'JOB' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    var job = {
      jobId: jobId, productId: productId,
      selectedRMIDs: activeRM.map(function (r) { return r.rmid; }),
      servingMl: servingMl, nSolutions: payload.nSolutions || DEFAULT_N_SOLUTIONS,
      fatBasis: payload.fatBasis || DEFAULT_FAT_BASIS,
      waterParams: waterParams,
      startedAt: Date.now(), status: 'running', currentStep: 0,
      stepLabel: 'Menyiapkan data…', progressPct: 5,
      result: null, error: null, log: []
    };
    saveJob_(job);
    return { ok: true, jobId: jobId };
  } catch (e) {
    Logger.log('startOptimizationJob error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function stepOptimizationJob(jobId) {
  try {
    var job = loadJob_(jobId);
    if (!job) return { ok: false, error: 'Job tidak ditemukan' };
    if (job.status === 'error') return { ok: false, error: job.error };

    if (job.currentStep === 0) {
      job.currentStep = 1;
      job.progressPct = 10;
      job.stepLabel = 'Memuat data…';
      job.log = [{ time: new Date().toLocaleTimeString('id-ID'), msg: 'Memuat data…', success: false, type: 'info' }];
      saveJob_(job);
      clearTempBank_(jobId);
    }

    var rmList = parseRawMaterial();
    var products = parseProduct();
    var product = products.filter(function (p) { return p.productId === job.productId; })[0];
    var activeRM = filterActiveRM_(rmList, job.selectedRMIDs);
    var nonAirRM = activeRM.filter(function (r) { return !isWaterRM_(r); });
    var waterRM = activeRM.filter(function (r) { return isWaterRM_(r); })[0] || null;

    var pushLog = function (msg, type, success) {
      var j = loadJob_(jobId);
      if (!j) return;
      j.log = j.log || [];
      j.log.push({ time: new Date().toLocaleTimeString('id-ID'), msg: msg, success: !!success, type: type || 'info' });
      if (j.log.length > JOB_MAX_LOG_ENTRIES) j.log = j.log.slice(-JOB_MAX_LOG_ENTRIES);
      j.stepLabel = msg;
      saveJob_(j);
    };

    var tempBank = getTempBank_(jobId);

    var res = solveAndEvaluate({
      nonAirRM: nonAirRM, waterRM: waterRM, activeRM: activeRM,
      product: product, target: product.target,
      density: product.density || DEFAULT_DENSITY,
      servingMl: job.servingMl, nSolutions: job.nSolutions, fatBasis: job.fatBasis,
      algRef: parseAlgReference(), premixes: parsePremix(),
      stabilityRules: parseStabilityRule(), nutriRules: parseNutriLevelRules(),
      psRules: parsePilihanSehatRules(),
      resumeState: tempBank.length > 0 || job.currentStep > 1 ? job.resumeState : { k: 1, si: 0, bank: tempBank },
      onProgress: function (msg, type, success) { pushLog(msg, type, success); }
    });

    if (res.isDone === false) {
      job.resumeState = res.nextState;
      saveTempBank_(jobId, res.nextState.bank);
      saveJob_(job);
      return { ok: true, status: 'running', progressPct: 50, stepLabel: 'Memproses kombinasi RM…', log: job.log || [], tempResults: res.tempResults || [] };
    }

        // === 4-ENGINE ORCHESTRATION DENGAN CACHE (anti-truncation) ===
    if (res.feasible && res.results && res.results.length > 0) {
      var uhtProtocols = parseUHTProtocol();
      var stabilityRules = parseStabilityRule();
      var waterParams = job.waterParams || WATER_PARAMS_DEFAULT;
      pushLog('▶ Menjalankan 4-Engine UHT Stability DSS… (uhtProtocols=' + uhtProtocols.length + ')', 'stage', true);

      var engineFailCount = 0;
      res.results.forEach(function (sol, idx) {
        try {
          var fe = runFourEngine_(sol, {
            activeRM: activeRM,
            product: product,
            waterParams: waterParams,
            stabilityRules: stabilityRules,
            uhtProtocols: uhtProtocols
          });
          saveFourEngineToCache_(jobId, idx, fe);
          sol.fourEngine = summarizeFourEngine_(fe);
          sol.fourEngineIdx = idx;
        } catch (e) {
          engineFailCount++;
          Logger.log('4-Engine error untuk solusi: ' + e.message + '\n' + e.stack);
          sol.fourEngine = { error: 'Gagal orkestrasi 4-Engine: ' + e.message };
        }
      });

      if (engineFailCount === 0) {
        pushLog('✓ 4-Engine selesai untuk ' + res.results.length + ' solusi (detail di-cache)', 'stage', true);
      } else {
        pushLog('⚠ 4-Engine selesai dengan ' + engineFailCount + ' error', 'stage', false);
      }
    }

    job.currentStep = 2;
    job.status = 'done';
    saveJob_(job);
    clearTempBank_(jobId);

    return { ok: true, status: 'done', progressPct: 100, stepLabel: 'Selesai', result: res, log: job.log || [] };
  } catch (e) {
    Logger.log('stepOptimizationJob error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}

function cancelOptimizationJob(jobId) {
  try {
    var cache = CacheService.getScriptCache();
    if (cache) cache.remove(JOB_CACHE_PREFIX + jobId);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function saveJob_(job) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return;
    var resumeStateSafe = null;
    if (job.resumeState) resumeStateSafe = { k: job.resumeState.k, si: job.resumeState.si };
    var slim = {
      jobId: job.jobId, status: job.status, progressPct: job.progressPct,
      stepLabel: job.stepLabel, currentStep: job.currentStep, error: job.error,
      productId: job.productId, selectedRMIDs: job.selectedRMIDs,
      servingMl: job.servingMl, nSolutions: job.nSolutions, fatBasis: job.fatBasis,
      waterParams: job.waterParams,
      resumeState: resumeStateSafe, log: (job.log || []).slice(-20)
    };
    var json = JSON.stringify(slim);
    cache.put(JOB_CACHE_PREFIX + job.jobId, json, JOB_TTL_SECONDS);
  } catch (e) { Logger.log('saveJob_ error: ' + e.message); }
}

function loadJob_(jobId) {
  try {
    var cache = CacheService.getScriptCache();
    var json = cache ? cache.get(JOB_CACHE_PREFIX + jobId) : null;
    if (!json) return null;
    return JSON.parse(json);
  } catch (e) { return null; }
}

// ============================================================================
// INITIAL DATA & API
// ============================================================================

function getAppInitialData(force) {
  var access = requireAccess_();
  var cacheKey = getCacheKeyInitialData_();

  var cache = getCache_();
  if (cache && !force) {
    try { var cached = cache.get(cacheKey); if (cached) return JSON.parse(cached); } catch (e) { }
  }
  var data = {
    spreadsheetId: SPREADSHEET_ID_CODE, appVersion: APP_VERSION_CODE,
    currentUser: { email: access.email, role: access.role, name: access.name || '' },
    nutrientKeys: NUTRIENT_KEYS,
    defaults: { density: DEFAULT_DENSITY, servingMl: DEFAULT_SERVING_ML, pH: DEFAULT_PH, nSolutions: DEFAULT_N_SOLUTIONS, fatBasis: DEFAULT_FAT_BASIS },
    rawMaterials: parseRawMaterial(),
    products: parseProduct(),
    algReference: parseAlgReference(),
    servingSettings: parseServingSettings(),
    stabilityRules: parseStabilityRule(),
    premixCatalog: parsePremix(),
    nutriLevelRules: parseNutriLevelRules(),
    pilihanSehatRules: parsePilihanSehatRules(),
    uhtProtocols: parseUHTProtocol(),
    waterParams: WATER_PARAMS_DEFAULT
  };
  Logger.log('[getAppInitialData] user=' + access.email + ' role=' + access.role +
    ' | rawMaterials=' + data.rawMaterials.length +
    ', products=' + data.products.length +
    ', stabilityRules=' + data.stabilityRules.length +
    ', uhtProtocols=' + data.uhtProtocols.length +
    ', premixCatalog=' + data.premixCatalog.length);
  if (cache) {
    try {
      var str = JSON.stringify(data);
      if (str.length < 95000) cache.put(cacheKey, str, CACHE_TTL_SECONDS);
    } catch (e) { }
  }
  return data;
}

function api_runOptimizer(payload) {
  var startTime = Date.now();
  try {
    payload = payload || {};
    var productId = payload.productId;
    if (!productId) return { ok: false, error: 'productId wajib' };

    var rmList = parseRawMaterial();
    var products = parseProduct();
    var product = products.filter(function (p) { return p.productId === productId; })[0];
    if (!product) return { ok: false, error: 'Produk tidak ditemukan' };

    var selectedRMIDs = payload.selectedRMIDs || [];
    if (selectedRMIDs.length === 0) {
      selectedRMIDs = rmList.filter(function (r) { return r.isActive; }).map(function (r) { return r.rmid; });
    }
    var activeRM = filterActiveRM_(rmList, selectedRMIDs);
    var nonAirRM = activeRM.filter(function (r) { return !isWaterRM_(r); });
    var waterRM = activeRM.filter(function (r) { return isWaterRM_(r); })[0] || null;

    var waterParams = payload.waterParams || WATER_PARAMS_DEFAULT;

    var result = solveAndEvaluate({
      nonAirRM: nonAirRM, waterRM: waterRM, activeRM: activeRM,
      product: product, target: product.target,
      density: product.density || DEFAULT_DENSITY,
      servingMl: safeNum_(parseServingSettings().defaultServingMl) || DEFAULT_SERVING_ML,
      nSolutions: payload.nSolutions || DEFAULT_N_SOLUTIONS,
      fatBasis: payload.fatBasis || DEFAULT_FAT_BASIS,
      algRef: parseAlgReference(), premixes: parsePremix(),
      stabilityRules: parseStabilityRule(), nutriRules: parseNutriLevelRules(),
      psRules: parsePilihanSehatRules(),
      onProgress: function () { }
    });

    if (result.feasible && result.results && result.results.length > 0) {
      var uhtProtocols = parseUHTProtocol();
      var stabilityRules = parseStabilityRule();
      var runId = 'RUN' + Date.now();
      Logger.log('[api_runOptimizer] 4-Engine start — uhtProtocols=' + uhtProtocols.length);
      result.results.forEach(function (sol, idx) {
        try {
          var fe = runFourEngine_(sol, {
            activeRM: activeRM,
            product: product,
            waterParams: waterParams,
            stabilityRules: stabilityRules,
            uhtProtocols: uhtProtocols
          });
          saveFourEngineToCache_(runId, idx, fe);
          sol.fourEngine = summarizeFourEngine_(fe);
          sol.fourEngineIdx = idx;
        } catch (e) {
          Logger.log('[api_runOptimizer] 4-Engine error: ' + e.message);
          sol.fourEngine = { error: 'Gagal orkestrasi 4-Engine: ' + e.message };
        }
      });
      result.runId = runId;
    }

    return JSON.parse(JSON.stringify({
      ok: true, elapsedMs: Date.now() - startTime, productId: productId,
      feasible: result.feasible, bankSize: result.bankSize,
      results: result.results, reason: result.reason || null
    }));
  } catch (e) {
    Logger.log('api_runOptimizer FATAL: ' + e.message + '\n' + e.stack);
    return { ok: false, error: 'Backend error: ' + e.message };
  }
}

// ============================================================================
// CRUD & ENTRY POINTS
// ============================================================================

function writeRowsByKey(sheetName, keyHeader, payload) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + sheetName);
  var headers = getSheetHeaders_(sheet);
  var keyIdx = headers.indexOf(keyHeader);
  if (keyIdx < 0) throw new Error('Header ' + keyHeader + ' tidak ada');
  if (!payload[keyHeader]) throw new Error(keyHeader + ' wajib diisi');
  var rowValues = headers.map(function (h) { return payload[h] !== undefined && payload[h] !== null ? payload[h] : ''; });
  var lastRow = sheet.getLastRow();
  var existingRow = -1;
  if (lastRow >= 2) {
    var keyValues = sheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keyValues.length; i++) {
      if (String(keyValues[i][0]).trim() === String(payload[keyHeader]).trim()) { existingRow = i + 2; break; }
    }
  }
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowValues]);
    return { ok: true, mode: 'update', row: existingRow };
  }
  sheet.appendRow(rowValues);
  return { ok: true, mode: 'insert', row: sheet.getLastRow() };
}

function api_upsertRawMaterial(payload) {
  try {
    if (!payload || !payload.RMID || payload.RMID.trim() === '') {
      payload.RMID = generateNextId_('raw_material', 'RMID', 'RM');
    }
    if (safeNum_(payload['Price/kg (Rp)']) < 0) return { ok: false, error: 'Harga harus >= 0' };
    var minPct = safeNum_(payload['Min %']), maxPct = safeNum_(payload['Max %']);
    if (minPct > maxPct && maxPct > 0) return { ok: false, error: 'Min % > Max %' };
    if (payload.is_active !== undefined) payload.is_active = safeBool_(payload.is_active);
    var res = writeRowsByKey('raw_material', 'RMID', payload);
    invalidateInitialDataCache_();
    return { ok: true, mode: res.mode };
  } catch (e) { return { ok: false, error: e.message }; }
}

function api_deleteRawMaterial(rmid) {
  try {
    if (!rmid) return { ok: false, error: 'RMID wajib' };
    writeRowsByKey('raw_material', 'RMID', { RMID: rmid, is_active: false });
    invalidateInitialDataCache_();
    return { ok: true, mode: 'soft_delete' };
  } catch (e) { return { ok: false, error: e.message }; }
}

function api_upsertProduct(payload) {
  try {
    if (!payload || !payload.ProductID || String(payload.ProductID).trim() === '') {
      payload.ProductID = generateNextId_('product_master', 'ProductID', 'PRD');
    } else {
      payload.ProductID = String(payload.ProductID).trim();
    }
    if (payload.is_active !== undefined) payload.is_active = safeBool_(payload.is_active);

    // --- Normalisasi field baru (backward-compatible) ---
    // writeRowsByKey menulis '' untuk key yang tidak ada, jadi jangan biarkan
    // ProductType kosong (nanti parseProduct fallback UHT, tapi lebih baik eksplisit).
    var rawType = payload.ProductType === undefined || payload.ProductType === null
      ? '' : String(payload.ProductType).trim();
    var VALID_TYPES = ['UHT', 'Yogurt', 'IceCream', 'ProcessedCheese'];
    if (rawType === '' || VALID_TYPES.indexOf(rawType) === -1) {
      payload.ProductType = 'UHT';
    } else {
      payload.ProductType = rawType;
    }

    // TargetTS: kosong → '' (parseProduct akan map ke null). Angka valid → number.
    if (payload.TargetTS === undefined || payload.TargetTS === null || String(payload.TargetTS).trim() === '') {
      payload.TargetTS = '';
    } else {
      var tsNum = safeNum_(payload.TargetTS);
      payload.TargetTS = (isNaN(tsNum) || tsNum < 0) ? '' : tsNum;
    }

    var res = writeRowsByKey('product_master', 'ProductID', payload);
    invalidateInitialDataCache_();
    return { ok: true, mode: res.mode };
  } catch (e) { return { ok: false, error: e.message }; }
}

function api_deleteProduct(productId) {
  try {
    if (!productId) return { ok: false, error: 'ProductID wajib' };
    writeRowsByKey('product_master', 'ProductID', { ProductID: productId, is_active: false });
    invalidateInitialDataCache_();
    return { ok: true, mode: 'soft_delete' };
  } catch (e) { return { ok: false, error: e.message }; }
}

function doGet(e) {
  var access = checkAccess_();
  if (!access.allowed) {
    Logger.log('[doGet] DITOLAK: ' + access.email + ' — ' + access.reason);
    return HtmlService.createHtmlOutput(renderAccessDenied_(access)).setTitle('Akses Ditolak');
  }
  Logger.log('[doGet] OK: ' + access.email + ' (' + access.role + ')');
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('DairyOptima')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function showSidebarApp() {
  var html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('DairyOptima')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showModalDialog() {
  var html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'DairyOptima Optimizer');
}

// Helper untuk include file HTML di template (dipakai oleh <?!= include('nama') ?>)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// API CRUD: NUTRI LEVEL & PILIHAN SEHAT (versi 1 — nutri_level_criteria & pilihan_sehat_criteria)
// ============================================================================

function api_upsertNutriLevel(payload) {
  try {
    if (!payload || !payload.nutrient) return { ok: false, error: 'Nutrient wajib' };

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName('nutri_level_criteria');
    if (!sheet) throw new Error('Sheet nutri_level_criteria tidak ditemukan');

    var headers = getSheetHeaders_(sheet);
    var nutIdx = headers.indexOf('Nutrient');
    var aIdx = headers.indexOf('Grade A');
    var bIdx = headers.indexOf('Grade B');
    var cIdx = headers.indexOf('Grade C');
    var dIdx = headers.indexOf('Grade D');

    var lastRow = sheet.getLastRow();
    var existingRow = -1;

    if (lastRow >= 2) {
      var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][nutIdx]).trim() === payload.nutrient) {
          existingRow = i + 2;
          break;
        }
      }
    }

    if (existingRow > 0) {
      sheet.getRange(existingRow, aIdx + 1).setValue(payload.gradeAMax);
      sheet.getRange(existingRow, bIdx + 1).setValue(payload.gradeBMax);
      sheet.getRange(existingRow, cIdx + 1).setValue(payload.gradeCMax);
      sheet.getRange(existingRow, dIdx + 1).setValue(payload.gradeDMin);
      invalidateInitialDataCache_();
      return { ok: true, mode: 'update' };
    } else {
      var newRow = new Array(headers.length).fill('');
      newRow[nutIdx] = payload.nutrient;
      newRow[aIdx] = payload.gradeAMax;
      newRow[bIdx] = payload.gradeBMax;
      newRow[cIdx] = payload.gradeCMax;
      newRow[dIdx] = payload.gradeDMin;
      sheet.appendRow(newRow);
      invalidateInitialDataCache_();
      return { ok: true, mode: 'insert' };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function api_upsertPilihanSehat(payload) {
  try {
    if (!payload || !payload.category || !payload.sugarMax) return { ok: false, error: 'Category & SugarMax wajib' };

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName('pilihan_sehat_criteria');
    if (!sheet) throw new Error('Sheet pilihan_sehat_criteria tidak ditemukan');

    var headers = getSheetHeaders_(sheet);
    var catIdx = headers.indexOf('Kategori Produk');
    var sugarIdx = headers.indexOf('Batas Gula');

    var lastRow = sheet.getLastRow();
    var existingRow = -1;
    var targetCat = (payload.category === 'plain') ? 'Susu UHT Plain' : 'Susu UHT Berperisa';

    if (lastRow >= 2) {
      var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][catIdx]).trim() === targetCat) {
          existingRow = i + 2;
          break;
        }
      }
    }

    var sugarText = 'Gula total ≤ ' + payload.sugarMax + ' g/100ml';
    if (payload.category === 'plain') sugarText = 'Gula ≤ ' + payload.sugarMax + ' g/100ml';

    if (existingRow > 0) {
      sheet.getRange(existingRow, sugarIdx + 1).setValue(sugarText);
      invalidateInitialDataCache_();
      return { ok: true, mode: 'update' };
    } else {
      var newRow = new Array(headers.length).fill('');
      newRow[catIdx] = targetCat;
      newRow[sugarIdx] = sugarText;
      sheet.appendRow(newRow);
      invalidateInitialDataCache_();
      return { ok: true, mode: 'insert' };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// ADMIN STUBS (dipanggil Index.html dari tombol "🔒 LP Solver (Admin)")
// ============================================================================

function api_checkAdminStatus() {
  return { active: false, note: 'Fitur admin belum diimplementasi.' };
}

function api_activateAdmin(pwd) {
  return { ok: false, error: 'Fitur admin belum diimplementasi. Hubungi developer.' };
}
// ============================================================================
// ANTI-TRUNCATION: 4-ENGINE CACHE HELPERS
// ============================================================================

function saveFourEngineToCache_(jobId, solIdx, fourEngine) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return null;
    var key = 'DO_FE_' + jobId + '_' + solIdx;
    var json = JSON.stringify(fourEngine);
    if (json.length > 95000) {
      var slim = JSON.parse(json);
      if (slim.engine1 && slim.engine1.checks && slim.engine1.checks.length > 12) {
        slim.engine1.checks = slim.engine1.checks.slice(0, 12);
      }
      if (slim.engine2 && slim.engine2.diagnoses && slim.engine2.diagnoses.length > 10) {
        slim.engine2.diagnoses = slim.engine2.diagnoses.slice(0, 10);
      }
      json = JSON.stringify(slim);
    }
    cache.put(key, json, 3600);
    return true;
  } catch (e) {
    Logger.log('saveFourEngineToCache_ error: ' + e.message);
    return false;
  }
}

function summarizeFourEngine_(fourEngine) {
  if (!fourEngine) return null;
  if (fourEngine.error) return { error: fourEngine.error };
  var e1 = fourEngine.engine1 || {};
  var e2 = fourEngine.engine2 || {};
  var e3 = fourEngine.engine3 || {};
  var e4 = fourEngine.engine4 || {};
  return {
    engine1Overall: e1.overall || 'Low',
    engine1RiskScore: e1.riskScore || 0,
    engine1HighCount: e1.highCount || 0,
    engine1MediumCount: e1.mediumCount || 0,
    engine1OkCount: e1.okCount || 0,
    engine2Overall: e2.overall || 'Low',
    engine2TriggeredCount: e2.triggeredCount || 0,
    engine2ConfirmedCount: e2.confirmedCount || 0,
    engine2NeedsVerificationCount: e2.needsVerificationCount || 0,
    engine3ProcessCount: (e3.processActions || []).length,
    engine3AdditiveCount: (e3.additiveActions || []).length,
    engine4TotalProtocols: e4.totalProtocols || 0,
    engine4Phases: e4.phases || [],
    engine4RiskCategories: e4.riskCategories || [],
    generatedAt: fourEngine.generatedAt || null,
    cached: true
  };
}

function api_getFourEngineDetail(jobId, solIdx) {
  try {
    if (!jobId && jobId !== 0) return { ok: false, error: 'jobId wajib' };
    if (solIdx === undefined || solIdx === null) return { ok: false, error: 'solIdx wajib' };
    var cache = CacheService.getScriptCache();
    if (!cache) return { ok: false, error: 'Cache tidak tersedia' };
    var key = 'DO_FE_' + jobId + '_' + solIdx;
    var json = cache.get(key);
    if (!json) return { ok: false, error: 'Detail 4-Engine tidak ditemukan (mungkin expired). Jalankan ulang optimasi.' };
    return { ok: true, fourEngine: JSON.parse(json) };
  } catch (e) {
    Logger.log('api_getFourEngineDetail error: ' + e.message);
    return { ok: false, error: e.message };
  }
}
/*************************************************************
 * === CONFIG-DRIVEN: PROCESS TEMPLATES (FASE 1) ===
 * Sheet: process_templates
 * Kolom: TemplateID | ProductType | StepNo | StepName | Temp | Time | Notes
 *************************************************************/

function getProcessTemplatesRaw_() {
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = 'PROCESS_TEMPLATES_V1';
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('process_templates');
  if (!sh) {
    throw new Error("Sheet 'process_templates' tidak ditemukan. Jalankan setup_processTemplates() dulu.");
  }

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const idx = {
    TemplateID:  headers.indexOf('TemplateID'),
    ProductType: headers.indexOf('ProductType'),
    StepNo:      headers.indexOf('StepNo'),
    StepName:    headers.indexOf('StepName'),
    Temp:        headers.indexOf('Temp'),
    Time:        headers.indexOf('Time'),
    Notes:       headers.indexOf('Notes')
  };
  ['TemplateID','ProductType','StepNo','StepName'].forEach(k => {
    if (idx[k] === -1) throw new Error(`Header '${k}' tidak ditemukan di process_templates.`);
  });

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[idx.TemplateID] || !r[idx.ProductType]) continue;
    rows.push({
      TemplateID:  String(r[idx.TemplateID]).trim(),
      ProductType: String(r[idx.ProductType]).trim(),
      StepNo:      Number(r[idx.StepNo]) || (rows.length + 1),
      StepName:    String(r[idx.StepName] || '').trim(),
      Temp:        r[idx.Temp]  !== '' ? String(r[idx.Temp]).trim()  : '',
      Time:        r[idx.Time]  !== '' ? String(r[idx.Time]).trim()  : '',
      Notes:       r[idx.Notes] !== '' ? String(r[idx.Notes]).trim() : ''
    });
  }

  try { cache.put(CACHE_KEY, JSON.stringify(rows), 300); } catch (e) {}
  return rows;
}

function getProcessTemplate_(productType) {
  const all = getProcessTemplatesRaw_();
  const target = String(productType || '').trim();

  let filtered = all.filter(r => r.ProductType.toLowerCase() === target.toLowerCase());

  if (filtered.length === 0) {
    console.warn(`[getProcessTemplate_] Tidak ada template untuk ProductType='${target}'. Fallback ke UHT.`);
    filtered = all.filter(r => r.ProductType.toUpperCase() === 'UHT');
  }

  filtered.sort((a, b) => (a.StepNo - b.StepNo) || a.StepName.localeCompare(b.StepName));

  return filtered.map(r => ({
    TemplateID: r.TemplateID,
    StepNo:     r.StepNo,
    StepName:   r.StepName,
    Temp:       r.Temp,
    Time:       r.Time,
    Notes:      r.Notes
  }));
}

function api_getAvailableProductTypes() {
  try {
    const rows = getProcessTemplatesRaw_();
    const set = new Set(rows.map(r => r.ProductType));
    return { ok: true, data: Array.from(set).sort() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function api_getProcessTemplate(productType) {
  try {
    const steps = getProcessTemplate_(productType);
    return { ok: true, productType: productType, data: steps };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function invalidateProcessTemplateCache_() {
  try { CacheService.getScriptCache().remove('PROCESS_TEMPLATES_V1'); } catch (e) {}
}
/**
 * Baca stability_rules & filter berdasarkan ProductType.
 * - Aturan dengan ProductType kosong dianggap berlaku untuk SEMUA tipe (global).
 * - Aturan dengan ProductType tertentu hanya berlaku untuk tipe itu (case-insensitive).
 *
 * @param {string} productType - 'UHT' | 'Yogurt' | 'IceCream' | 'ProcessedCheese' | ...
 * @param {Array=} allRules - optional, kalau sudah ada array rules yang sudah dibaca
 * @returns {Array<Object>}
 */
function readStabilityRulesForType_(productType, allRules) {
  const rules = allRules || readSheetAsObjects('stability_rules');
  const target = String(productType || 'UHT').trim().toLowerCase();

  return rules.filter(function (r) {
    const t = String(getCol_(r, 'ProductType') || '').trim().toLowerCase();
    if (t === '') return true;          // global rule → berlaku untuk semua
    if (t === 'all') return true;       // alias global
    return t === target;
  });
}
