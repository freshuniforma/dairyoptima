/**
 * ============================================================================
 * DairyOptima — recipe.gs (v1.0.0 — Recipe Bank Backend)
 * ============================================================================
 * Modul terpisah untuk Recipe Management System.
 * TIDAK mengubah code.gs existing — hanya menambah fungsi baru.
 * ============================================================================
 */

var RECIPE_BANK_SHEET = 'recipe_bank';
var RECIPE_VERSIONS_SHEET = 'recipe_versions';
var RECIPE_TESTS_SHEET = 'recipe_stability_tests';

var RECIPE_STATUS_VALUES = ['Draft', 'Trial', 'Approved', 'Archived'];

var RECIPE_BANK_HEADERS = [
  'RecipeID', 'RecipeName', 'ProductID', 'ProductName', 'BPOMCategory', 'Status',
  'Version', 'ParentRecipeID', 'CreatedAt', 'UpdatedAt', 'CreatedBy',
  'CompositionJSON', 'TargetNutritionJSON', 'ActualNutritionJSON', 'HPPJSON',
  'NutriLevelJSON', 'PilihanSehatJSON', 'StabilityWarningsJSON', 'FourEngineJSON',
  'PremixRecommendationJSON', 'ProcessProcedureJSON', 'LabelTextJSON',
  'ActualQualityMetricsJSON', 'StabilityTestJSON', 'WaterParamsJSON', 'Notes',
  'Source'
];

var RECIPE_VERSIONS_HEADERS = [
  'RecipeID', 'Version', 'ChangedAt', 'ChangedBy', 'ChangeNotes', 'SnapshotJSON'
];

var RECIPE_TESTS_HEADERS = [
  'RecipeID', 'TestPhase', 'TestDate', 'Parameter', 'Value',
  'AcceptanceCriteria', 'Status', 'Notes'
];

// ============================================================================
// SETUP — Jalankan sekali untuk buat 3 sheet baru
// ============================================================================

/**
 * Buat 3 sheet Recipe Bank (idempotent — tidak menimpa yang sudah ada).
 * Jalankan manual dari editor Apps Script: pilih fungsi → Run.
 */
function setupRecipeBankSheets() {
  var ss = getSpreadsheet_();
  var results = [];

  var sheetsToCreate = [
    { name: RECIPE_BANK_SHEET, headers: RECIPE_BANK_HEADERS },
    { name: RECIPE_VERSIONS_SHEET, headers: RECIPE_VERSIONS_HEADERS },
    { name: RECIPE_TESTS_SHEET, headers: RECIPE_TESTS_HEADERS }
  ];

  sheetsToCreate.forEach(function (spec) {
    var sheet = ss.getSheetByName(spec.name);
    if (sheet) {
      // Sheet ada — cek header, tambah kolom baru jika kurang
      var existingHeaders = getSheetHeaders_(sheet);
      var missing = spec.headers.filter(function (h) { return existingHeaders.indexOf(h) < 0; });
      if (missing.length > 0) {
        var startCol = existingHeaders.length + 1;
        sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
        results.push('✓ ' + spec.name + ' : tambah ' + missing.length + ' kolom baru (' + missing.join(', ') + ')');
      } else {
        results.push('✓ ' + spec.name + ' : sudah lengkap (' + existingHeaders.length + ' kolom)');
      }
    } else {
      // Buat baru
      var newSheet = ss.insertSheet(spec.name);
      newSheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
      newSheet.setFrozenRows(1);
      newSheet.getRange(1, 1, 1, spec.headers.length)
        .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#fff');
      newSheet.setColumnWidths(1, spec.headers.length, 140);
      results.push('✓ ' + spec.name + ' : DIBUAT (' + spec.headers.length + ' kolom)');
    }
  });

  results.forEach(function (r) { Logger.log(r); });
  return { ok: true, log: results };
}

// ============================================================================
// PARSER
// ============================================================================

function parseRecipeBank() {
  var rows = readSheetAsObjects(RECIPE_BANK_SHEET);
  return rows.map(function (r) {
    function parseJson(colName, fallback) {
      var raw = getCol_(r, colName);
      if (!raw) return fallback;
      try {
        var str = (typeof raw === 'string') ? raw.trim() : JSON.stringify(raw);
        // Fix jika ada double array karena bug save sebelumnya: ][  -> ,
        str = str.replace(/\]\s*\[/g, ',');
        var obj = JSON.parse(str);
        return obj !== null && obj !== undefined ? obj : fallback;
      } catch (e) {
        Logger.log('parseJson error on ' + colName + ': ' + e.message);
        return fallback;
      }
    }
    return {
      recipeId: String(getCol_(r, 'RecipeID')).trim(),
      recipeName: String(getCol_(r, 'RecipeName')).trim(),
      productId: String(getCol_(r, 'ProductID')).trim(),
      productName: String(getCol_(r, 'ProductName')).trim(),
      bpomCategory: String(getCol_(r, 'BPOMCategory')).trim(),
      status: String(getCol_(r, 'Status')).trim() || 'Draft',
      version: safeNum_(getCol_(r, 'Version')) || 1,
      parentRecipeId: String(getCol_(r, 'ParentRecipeID')).trim(),
      createdAt: String(getCol_(r, 'CreatedAt')).trim(),
      updatedAt: String(getCol_(r, 'UpdatedAt')).trim(),
      createdBy: String(getCol_(r, 'CreatedBy')).trim(),
      composition: parseJson('CompositionJSON', {}),
      targetNutrition: parseJson('TargetNutritionJSON', {}),
      actualNutrition: parseJson('ActualNutritionJSON', {}),
      hpp: parseJson('HPPJSON', {}),
      nutriLevel: parseJson('NutriLevelJSON', {}),
      pilihanSehat: parseJson('PilihanSehatJSON', {}),
      stabilityWarnings: parseJson('StabilityWarningsJSON', []),
      fourEngineSummary: parseJson('FourEngineJSON', null),
      premixRecommendation: parseJson('PremixRecommendationJSON', {}),
      processProcedure: parseJson('ProcessProcedureJSON', []),
      labelText: parseJson('LabelTextJSON', []),
      actualQualityMetrics: parseJson('ActualQualityMetricsJSON', {}),
      stabilityTest: parseJson('StabilityTestJSON', []),
      waterParams: parseJson('WaterParamsJSON', null),
      notes: String(getCol_(r, 'Notes') || '').trim(),
      source: String(getCol_(r, 'Source') || 'Adopted').trim()
    };
  }).filter(function (rec) { return rec.recipeId !== ''; });
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentUserEmail_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email || 'unknown@local';
  } catch (e) {
    return 'unknown@local';
  }
}

function generateRecipeId_() {
  var sheet = getSpreadsheet_().getSheetByName(RECIPE_BANK_SHEET);
  if (!sheet) throw new Error('Sheet recipe_bank belum dibuat. Jalankan setupRecipeBankSheets() dulu.');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'RCP001';
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function (row) { return String(row[0]).trim(); })
    .filter(function (id) { return /^RCP\d+$/.test(id); });
  if (ids.length === 0) return 'RCP001';
  var maxNum = 0;
  ids.forEach(function (id) {
    var n = parseInt(id.replace('RCP', ''), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  var nextNum = maxNum + 1;
  return 'RCP' + ('000' + nextNum).slice(-3);
}

function nowIso_() {
  return new Date().toISOString();
}

/**
 * Insert atau update 1 baris resep di sheet.
 * @param {Object} recipeObj - Object dengan field sesuai RECIPE_BANK_HEADERS
 */
function writeRecipeRow_(recipeObj) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(RECIPE_BANK_SHEET);
  if (!sheet) throw new Error('Sheet recipe_bank belum dibuat. Jalankan setupRecipeBankSheets() dulu.');

  var headers = getSheetHeaders_(sheet);
  var recipeIdIdx = headers.indexOf('RecipeID');
  if (recipeIdIdx < 0) throw new Error('Kolom RecipeID tidak ditemukan di sheet recipe_bank');

  var lastRow = sheet.getLastRow();
  var existingRow = -1;
  if (lastRow >= 2) {
    var idValues = sheet.getRange(2, recipeIdIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0]).trim() === recipeObj.RecipeID) {
        existingRow = i + 2;
        break;
      }
    }
  }

  var rowValues = headers.map(function (h) {
    var v = recipeObj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowValues]);
    return { mode: 'update', row: existingRow };
  }
  sheet.appendRow(rowValues);
  return { mode: 'insert', row: sheet.getLastRow() };
}

// ============================================================================
// API — LIST & DETAIL
// ============================================================================

/**
 * List resep dengan filter opsional.
 * @param {Object} filters - {status, productId, bpomCategory, search}
 */
function api_listRecipes(filters) {
  try {
    filters = filters || {};
    var recipes = parseRecipeBank();

    if (filters.status && filters.status !== 'All') {
      recipes = recipes.filter(function (r) { return r.status === filters.status; });
    }
    if (filters.productId) {
      recipes = recipes.filter(function (r) { return r.productId === filters.productId; });
    }
    if (filters.bpomCategory) {
      recipes = recipes.filter(function (r) { return r.bpomCategory === filters.bpomCategory; });
    }
    if (filters.search && String(filters.search).trim() !== '') {
      var q = String(filters.search).trim().toLowerCase();
      recipes = recipes.filter(function (r) {
        var id = (r.recipeId || '').toLowerCase();
        var name = (r.recipeName || '').toLowerCase();
        var notes = (r.notes || '').toLowerCase();
        var by = (r.createdBy || '').toLowerCase();
        return id.indexOf(q) >= 0 || name.indexOf(q) >= 0 || notes.indexOf(q) >= 0 || by.indexOf(q) >= 0;
      });
    }

    // Sort by UpdatedAt descending
    recipes.sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    // Return summary only (untuk list)
    var summaries = recipes.map(function (r) {
      return {
        recipeId: r.recipeId,
        recipeName: r.recipeName,
        productId: r.productId,
        productName: r.productName,
        bpomCategory: r.bpomCategory,
        status: r.status,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdBy: r.createdBy,
        hppPerKg: r.hpp ? (r.hpp.perKg || r.hpp.hppPerKg || 0) : 0,
        hppPerLiter: r.hpp ? (r.hpp.perLiter || r.hpp.hppPerLiter || 0) : 0,
        nutriLevelOverall: r.nutriLevel ? (r.nutriLevel.overall || '-') : '-',
        pilihanSehatPass: r.pilihanSehat ? !!r.pilihanSehat.pass : false,
        compositionCount: Object.keys(r.composition || {}).length,
        source: r.source || 'Adopted'
      };
    });

    return { ok: true, count: summaries.length, recipes: summaries };
  } catch (e) {
    Logger.log('api_listRecipes error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Detail resep lengkap + re-run 4-Engine (jika composition ada).
 */
function api_getRecipeDetail(recipeId) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep ' + recipeId + ' tidak ditemukan' };

    var isOwner = (recipe.createdBy === getCurrentUserEmail_());

    // Re-run 4-Engine jika ada composition dan product
    var fourEngineFull = null;
    try {
      if (recipe.composition && Object.keys(recipe.composition).length > 0 && recipe.productId) {
        var rmList = parseRawMaterial();
        var products = parseProduct();
        var product = products.filter(function (p) { return p.productId === recipe.productId; })[0];
        if (product) {
          var activeRM = filterActiveRM_(rmList, Object.keys(recipe.composition));
          var nutritionPer100g = computeNutritionFromComposition(recipe.composition, activeRM);
          var density = product.density || DEFAULT_DENSITY;
          var nutritionPer100ml = nutritionPer100ml_(nutritionPer100g, density);

          var uhtProtocols = parseUHTProtocol();
          var stabilityRules = parseStabilityRule();
          var waterParams = recipe.waterParams || WATER_PARAMS_DEFAULT;

          var sol = {
            composition: recipe.composition,
            nutritionPer100ml: nutritionPer100ml,
            costPerKg: recipe.hpp ? (recipe.hpp.perKg || 0) : 0
          };

          fourEngineFull = runFourEngine_(sol, {
            activeRM: activeRM,
            product: product,
            waterParams: waterParams,
            stabilityRules: stabilityRules,
            uhtProtocols: uhtProtocols
          });
        }
      }
    } catch (e) {
      Logger.log('api_getRecipeDetail re-run 4-Engine error: ' + e.message);
      fourEngineFull = { error: 'Gagal re-run 4-Engine: ' + e.message };
    }

    return {
      ok: true,
      recipe: recipe,
      fourEngineFull: fourEngineFull,
      isOwner: isOwner,
      currentUser: getCurrentUserEmail_()
    };
  } catch (e) {
    Logger.log('api_getRecipeDetail error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// API — ADOPT (dari Detail Formula Optimizer → Recipe Bank)
// ============================================================================

function api_adoptRecipe(payload) {
  try {
    payload = payload || {};
    var recipeName = String(payload.recipeName || '').trim();
    if (!recipeName) return { ok: false, error: 'Nama resep wajib' };

    var formula = payload.formulaSnapshot;
    if (!formula || !formula.composition) return { ok: false, error: 'Data formula tidak valid' };

    var productId = String(formula.productId || payload.productId || '').trim();
    if (!productId) return { ok: false, error: 'productId tidak ditemukan' };

    var products = parseProduct();
    var product = products.filter(function (p) { return p.productId === productId; })[0];
    if (!product) return { ok: false, error: 'Produk tidak ditemukan' };

    var recipeId = generateRecipeId_();
    var now = nowIso_();
    var userEmail = getCurrentUserEmail_();

    // Hanya ambil data dasar. Biarkan sistem menghitung 4-Engine & Label saat detail dibuka.
    var hppJson = {
      perKg: formula.costPerKg || 0,
      perLiter: formula.hppPerLiter || 0,
      perSaji: formula.hppPerSaji || 0,
      breakdown: formula.costBreakdown || []
    };

    // --- LANGKAH 4: tarik template proses sesuai ProductType ---
    var processProcedure = [];
    try {
      processProcedure = generateDefaultProcessProcedure_({ productType: product.productType });
    } catch (e) {
      Logger.log('api_adoptRecipe process procedure error: ' + e.message);
    }

    var rowPayload = {
      RecipeID: recipeId,
      RecipeName: recipeName,
      ProductID: productId,
      ProductName: product.product || '',
      BPOMCategory: product.category || '',
      Status: 'Draft',
      Version: 1,
      ParentRecipeID: '',
      CreatedAt: now,
      UpdatedAt: now,
      CreatedBy: userEmail,
      CompositionJSON: formula.composition || {},
      TargetNutritionJSON: product.target || {},
      ActualNutritionJSON: formula.nutritionPer100ml || {},
      HPPJSON: hppJson,
      NutriLevelJSON: formula.nutriLevel || {},
      PilihanSehatJSON: formula.pilihanSehat || {},
      StabilityWarningsJSON: [],
      FourEngineJSON: null,
      PremixRecommendationJSON: {},
      ProcessProcedureJSON: processProcedure,   // <-- sekarang terisi
      LabelTextJSON: [],
      ActualQualityMetricsJSON: {},
      StabilityTestJSON: [],
      WaterParamsJSON: payload.waterParams || WATER_PARAMS_DEFAULT,
      Notes: String(payload.notes || '').trim(),
      Source: 'Adopted'
    };

    writeRecipeRow_(rowPayload);
    invalidateInitialDataCache_();

    return {
      ok: true,
      mode: 'insert',
      recipeId: recipeId,
      recipeName: recipeName,
      message: 'Resep "' + recipeName + '" berhasil disimpan.'
    };
  } catch (e) {
    Logger.log('api_adoptRecipe error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}

/**
 * LANGKAH 4: Wrapper backward-compatible.
 * Menggantikan hardcoded UHT procedure dengan template dari sheet process_templates,
 * difilter berdasarkan ProductType.
 *
 * @param {Object} formula - { composition?, productType?, product? }
 * @returns {Array<{step, name, parameter, temp, time, notes}>}
 */
function generateDefaultProcessProcedure_(formula) {
  formula = formula || {};

  // Resolve productType dari beberapa sumber (urutan prioritas)
  var productType = formula.productType
    || (formula.product && formula.product.productType)
    || 'UHT';

  var steps;
  try {
    steps = getProcessTemplate_(productType);
  } catch (e) {
    Logger.log('generateDefaultProcessProcedure_ error: ' + e.message +
               ' — fallback ke array kosong.');
    return [];
  }

  if (!steps || steps.length === 0) {
    Logger.log('generateDefaultProcessProcedure_: template kosong untuk type=' + productType);
    return [];
  }

  // Mapping format sheet → format lama (backward-compatible)
  return steps.map(function (s) {
    var parameterParts = [];
    if (s.Temp) parameterParts.push(s.Temp);
    if (s.Time) parameterParts.push(s.Time);
    return {
      step:      s.StepNo,
      name:      s.StepName,
      parameter: parameterParts.join(' · '),
      temp:      s.Temp || '',
      time:      s.Time || '',
      notes:     s.Notes || ''
    };
  });
}

// ============================================================================
// API — UPDATE & DELETE
// ============================================================================

/**
 * Update resep (partial). Hanya field tertentu yang bisa diubah.
 * @param {string} recipeId
 * @param {Object} updates - {status, notes, processProcedure, actualQualityMetrics, labelText, stabilityTest}
 */
function api_updateRecipe(recipeId, updates) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    updates = updates || {};

    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini. Hanya creator yang bisa mengubah.' };
    }

    // Validasi field
    var allowedFields = ['status', 'notes', 'processProcedure', 'actualQualityMetrics', 'labelText', 'stabilityTest', 'recipeName'];
    var appliedUpdates = {};
    Object.keys(updates).forEach(function (k) {
      if (allowedFields.indexOf(k) >= 0) appliedUpdates[k] = updates[k];
    });

    // Merge dengan data lama
    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: appliedUpdates.recipeName !== undefined ? appliedUpdates.recipeName : recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: appliedUpdates.status !== undefined ? appliedUpdates.status : recipe.status,
      Version: recipe.version,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: nowIso_(),
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: appliedUpdates.processProcedure !== undefined ? appliedUpdates.processProcedure : recipe.processProcedure,
      LabelTextJSON: appliedUpdates.labelText !== undefined ? appliedUpdates.labelText : recipe.labelText,
      ActualQualityMetricsJSON: appliedUpdates.actualQualityMetrics !== undefined ? appliedUpdates.actualQualityMetrics : recipe.actualQualityMetrics,
      StabilityTestJSON: appliedUpdates.stabilityTest !== undefined ? appliedUpdates.stabilityTest : recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: appliedUpdates.notes !== undefined ? appliedUpdates.notes : recipe.notes
    };

    writeRecipeRow_(merged);
    invalidateInitialDataCache_();

    return { ok: true, mode: 'update', recipeId: recipeId };
  } catch (e) {
    Logger.log('api_updateRecipe error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Soft delete — set Status = 'Archived'.
 */
function api_deleteRecipe(recipeId) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: 'Archived',
      Version: recipe.version,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: nowIso_(),
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes
    };

    writeRecipeRow_(merged);
    invalidateInitialDataCache_();

    return { ok: true, mode: 'soft_delete', recipeId: recipeId };
  } catch (e) {
    Logger.log('api_deleteRecipe error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// API — STABILITY TEST LOG
// ============================================================================

/**
 * Tambah entri stability test untuk resep.
 * @param {string} recipeId
 * @param {Object} testData - {testPhase, testDate, parameter, value, acceptanceCriteria, status, notes}
 */
function api_addStabilityTest(recipeId, testData) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    testData = testData || {};

    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    // Append ke array stabilityTest di recipe row
    var tests = recipe.stabilityTest || [];
    tests.push({
      testPhase: String(testData.testPhase || '').trim(),
      testDate: String(testData.testDate || nowIso_()).trim(),
      parameter: String(testData.parameter || '').trim(),
      value: testData.value !== undefined ? testData.value : '',
      acceptanceCriteria: String(testData.acceptanceCriteria || '').trim(),
      status: String(testData.status || 'Pending').trim(),
      notes: String(testData.notes || '').trim()
    });

    // Juga append ke sheet terpisah (recipe_stability_tests) untuk audit trail
    try {
      var testSheet = getSpreadsheet_().getSheetByName(RECIPE_TESTS_SHEET);
      if (testSheet) {
        testSheet.appendRow([
          recipeId,
          tests[tests.length - 1].testPhase,
          tests[tests.length - 1].testDate,
          tests[tests.length - 1].parameter,
          tests[tests.length - 1].value,
          tests[tests.length - 1].acceptanceCriteria,
          tests[tests.length - 1].status,
          tests[tests.length - 1].notes
        ]);
      }
    } catch (e) { Logger.log('append to recipe_stability_tests error: ' + e.message); }

    var updateRes = api_updateRecipe(recipeId, { stabilityTest: tests });
    if (!updateRes.ok) return updateRes;

    return { ok: true, testsCount: tests.length };
  } catch (e) {
    Logger.log('api_addStabilityTest error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// API — SAVE AS NEW VERSION
// ============================================================================

/**
 * Duplikasi resep jadi versi baru (increment version, snapshot lama ke recipe_versions).
 */
// ============================================================================
// API — SAVE AS NEW VERSION
// Simpan snapshot versi LAMA ke sheet recipe_versions, increment Version.
// ============================================================================
function api_saveRecipeVersion(recipeId, changeNotes) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    var currentVersion = recipe.version || 1;
    var newVersion = currentVersion + 1;
    var now = nowIso_();

    // Snapshot versi LAMA ke sheet recipe_versions
    var snapshotJson = JSON.stringify({
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: recipe.status,
      Version: currentVersion,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes,
      Source: recipe.source || 'Adopted'
    });

    try {
      var versionsSheet = getSpreadsheet_().getSheetByName(RECIPE_VERSIONS_SHEET);
      if (versionsSheet) {
        versionsSheet.appendRow([
          recipe.recipeId,
          currentVersion,
          now,
          currentUser,
          String(changeNotes || '').trim() || '(tanpa catatan)',
          snapshotJson
        ]);
      }
    } catch (e) {
      Logger.log('snapshot version error: ' + e.message);
    }

    // Update Version di recipe_bank (data saat ini menjadi versi baru)
    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: recipe.status,
      Version: newVersion,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: now,
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes,
      Source: recipe.source || 'Adopted'
    };
    writeRecipeRow_(merged);
    invalidateInitialDataCache_();

    return {
      ok: true,
      version: newVersion,
      previousVersion: currentVersion,
      recipeId: recipe.recipeId,
      message: 'Versi baru (v' + newVersion + ') dibuat. Versi lama (v' + currentVersion + ') tersimpan di history.'
    };
  } catch (e) {
    Logger.log('api_saveRecipeVersion error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// API — PUBLISH SUB-RESEP SEBAGAI RAW MATERIAL (Versioned)
// ============================================================================
function api_publishSubRecipe(recipeId) {
  try {
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };
    
    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Hanya pemilik resep yang bisa publish.' };
    }

    // 1. Ambil semua RM asli untuk kalkulasi
    var rmList = parseRawMaterial();
    var activeRM = filterActiveRM_(rmList, Object.keys(recipe.composition || {}));
    if (activeRM.length === 0) return { ok: false, error: 'Komposisi resep kosong atau RM tidak aktif.' };

    // 2. Hitung nutrisi (basis 100g formula)
    var nutritionPer100g = computeNutritionFromComposition(recipe.composition, activeRM);
    
    // 3. Hitung HPP (basis 100g formula)
    var cost = computeCost_(recipe.composition, activeRM, 1, 100); // density 1, serving 100
    var pricePerKg = cost.hppPerKg;

    // 4. Siapkan Payload untuk raw_material
    // BEST PRACTICE: Sertakan versi agar tidak menimpa data historis
    var version = recipe.version || 1;
    var srId = 'SR-' + recipe.recipeId + '-v' + version; 
    
    // Map nutrient keys ke header kolom sheet
    var payload = {
      'RMID': srId,
      'RM': recipe.recipeName + ' (Sub-Resep v' + version + ')',
      'Category': 'Sub-Resep',
      'Price/kg (Rp)': Math.round(pricePerKg),
      'Moisture (%)': 0,
      'SNF (g)': nutritionPer100g.snf,
      'Total Solid (g)': nutritionPer100g.snf,
      'pH': 6.7, 
      'Min %': 0,
      'Max %': 100,
      'is_active': true,
      'Stability Flags': 'Auto-generated from ' + recipe.recipeId + ' v' + version,
      'Sensory Notes': 'Sub-resep dari ' + recipe.recipeId
    };

    // Map nutrisi dari NUTRIENT_KEYS ke header sheet
    Object.keys(RM_NUTRIENT_COLUMN_MAP).forEach(function(key) {
      var colName = RM_NUTRIENT_COLUMN_MAP[key];
      if (colName) {
        payload[colName] = nutritionPer100g[key] || 0;
      }
    });

    // 5. Simpan / Update ke sheet raw_material
    // writeRowsByKey otomatis akan menimpa HANYA jika ID + Versi tersebut sudah ada.
    // Jika Resep di-Save as New Version (v2), maka ID baru (SR-RCP001-v2) akan dibuat.
    writeRowsByKey('raw_material', 'RMID', payload);
    invalidateInitialDataCache_();
    // Opsional: Update status resep agar tercatat sudah dipublish
    if (recipe.status === 'Draft') {
      api_updateRecipeStatus(recipe.recipeId, 'Approved');
    }
    return {
      ok: true,
      rmid: srId,
      message: 'Sub-Resep ' + srId + ' berhasil dipublish/di-refresh.'
    };
  } catch (e) {
    Logger.log('api_publishSubRecipe error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}
// ============================================================================
// LABEL GENERATOR (server-side, mirror dari generateLabelOptionsLocal di Index.html)
// Return array of 4 opsi QUID: [{id, title, text}]
// ============================================================================
function generateLabelOptionsServer_(composition, rmList) {
  var rmMap = {};
  (rmList || []).forEach(function (rm) {
    if (!rm || !rm.rmid) return;
    rmMap[rm.rmid] = rm;
    rmMap[String(rm.rmid).trim().toUpperCase()] = rm;
  });

  function isWaterRM(rm) {
    if (!rm) return false;
    var cat = String(rm.category || '').trim().toLowerCase();
    var name = String(rm.name || '').trim().toLowerCase();
    return cat === 'water' || cat === 'air' || name === 'air' || name.indexOf('air ') !== -1 || name.indexOf('water') !== -1;
  }
  function isRawMilkRM(rm) {
    if (!rm) return false;
    var cat = String(rm.category || '').trim().toLowerCase();
    var name = String(rm.name || '').trim().toLowerCase();
    return cat === 'raw milk' || cat === 'susu segar' || name.indexOf('susu segar') !== -1 || name.indexOf('raw milk') !== -1;
  }
  function isDairySolidRM(rm) {
    if (!rm) return false;
    if (isWaterRM(rm) || isRawMilkRM(rm)) return false;
    var cat = String(rm.category || '').trim().toLowerCase();
    var name = String(rm.name || '').trim().toLowerCase();
    if (cat === 'milk powder' || cat === 'dairy' || cat === 'dairy powder' || cat === 'fat' ||
        cat === 'milk fat' || cat === 'susu bubuk' || cat === 'whey' || cat === 'whey powder' ||
        cat === 'lemak susu' || cat === 'cream' || cat === 'krim' || cat.indexOf('dairy') !== -1 ||
        cat.indexOf('milk') !== -1 || cat.indexOf('susu') !== -1) {
      return true;
    }
    var dairyKeywords = ['skim', 'smp', 'fcmp', 'wmp', 'milk powder', 'susu bubuk', 'whey', 'swp', 'wpc', 'wpi', 'amf', 'anhydrous', 'butter', 'mentega', 'lemak susu', 'krim', 'cream', 'padatan susu', 'milk solid', 'kasein', 'casein', 'caseinate', 'laktosa', 'lactose', 'evaporasi', 'evaporated', 'buttermilk', 'bmp', 'mpc', 'mpi', 'permeate', 'permeat'];
    for (var i = 0; i < dairyKeywords.length; i++) if (name.indexOf(dairyKeywords[i]) !== -1) return true;
    return false;
  }
  function getRMBahanTS(rm) {
    var ts = safeNum_(rm.totalSolid);
    if (ts > 0) return ts;
    var moist = safeNum_(rm.moisture);
    if (moist > 0 && moist < 100) return 100 - moist;
    var fat = (rm.nutrients && safeNum_(rm.nutrients.fatTotal)) || 0;
    var snf = safeNum_(rm.snf);
    if (fat + snf > 0) return fat + snf;
    var name = String(rm.name || '').toLowerCase();
    var cat = String(rm.category || '').toLowerCase();
    if (name.indexOf('amf') !== -1 || name.indexOf('anhydrous') !== -1 || name.indexOf('butter oil') !== -1) return 99.8;
    if (name.indexOf('butter') !== -1 || name.indexOf('mentega') !== -1) return 84.0;
    if (name.indexOf('cream') !== -1 || name.indexOf('krim') !== -1) return 40.0;
    if (name.indexOf('evaporat') !== -1 || name.indexOf('evaporasi') !== -1) return 26.0;
    if (cat === 'milk powder' || name.indexOf('powder') !== -1 || name.indexOf('bubuk') !== -1) return 96.0;
    if (cat === 'dairy' || cat === 'fat') return 99.8;
    return 12.0;
  }

  var rawMilk = 0, totalPadatan = 0, water = 0, premix = 0, others = [];
  var tsTotalPadatanPct = 0;
  var dairySolidItems = [];

  Object.keys(composition || {}).forEach(function (rmid) {
    var pct = safeNum_(composition[rmid]);
    if (pct <= 0) return;
    var rm = rmMap[rmid] || rmMap[String(rmid).trim().toUpperCase()];
    if (!rm) { others.push({ name: rmid, pct: pct }); return; }
    var cat = String(rm.category || '').trim().toLowerCase();
    if (isWaterRM(rm)) water += pct;
    else if (isRawMilkRM(rm)) rawMilk += pct;
    else if (isDairySolidRM(rm)) {
      var tsBahan = getRMBahanTS(rm);
      var tsContribution = pct * (tsBahan / 100);
      totalPadatan += pct;
      tsTotalPadatanPct += tsContribution;
      dairySolidItems.push({ rmid: rm.rmid, name: rm.name, pct: pct, tsBahan: tsBahan, tsContribution: tsContribution });
    } else if (cat === 'premix') premix += pct;
    else others.push({ name: rm.name, pct: pct });
  });

  var pctRekombinasiMurni = tsTotalPadatanPct / 0.12;
  var airTerserap = Math.max(0, pctRekombinasiMurni - totalPadatan);
  var sisaAir = Math.max(0, water - airTerserap);

  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function fmt2(n) { return (Math.round(n * 100) / 100).toFixed(2); }
  function sortDesc(arr) { return arr.sort(function (a, b) { return b.pct - a.pct; }); }
  var allergen = '.<br><em>Mengandung alergen: susu sapi.</em>';

  var parts = [];
  if (rawMilk > 0) parts.push('Segar');
  if (totalPadatan > 0) parts.push('Bubuk, Lemak Susu');
  var teksGabung = 'Susu (' + parts.join(', ') + ')';

  var dairySubNames = dairySolidItems.map(function (d) { return escapeHtmlServer_(d.name); }).join(', ');
  var teksRekombinasi = dairySolidItems.length > 0
    ? 'Susu Rekombinasi (Air, Padatan Susu (' + dairySubNames + '))'
    : 'Susu Rekombinasi (Air, Padatan Susu)';

  // Opsi 1: Standar QUID
  var o1 = [];
  if (water > 0) o1.push({ text: 'Air', pct: water });
  if (rawMilk > 0) o1.push({ text: '<strong>Susu Segar</strong> (' + fmt(rawMilk) + '%)', pct: rawMilk });
  if (totalPadatan > 0) o1.push({ text: '<strong>Padatan Susu</strong> (' + fmt(totalPadatan) + '%)', pct: totalPadatan });
  others.forEach(function (o) { o1.push({ text: escapeHtmlServer_(o.name) + ' (' + fmt(o.pct) + '%)', pct: o.pct }); });
  if (premix > 0) o1.push({ text: 'Premix Vitamin & Mineral', pct: premix });
  sortDesc(o1);
  var opt1 = o1.map(function (i) { return i.text; }).join(', ') + allergen;

  // Opsi 2: Rekombinasi
  var o2 = [];
  if (rawMilk > 0) o2.push({ text: '<strong>Susu Segar</strong> (' + fmt(rawMilk) + '%)', pct: rawMilk });
  if (pctRekombinasiMurni > 0) o2.push({ text: '<strong>' + teksRekombinasi + '</strong> (' + fmt(pctRekombinasiMurni) + '%)', pct: pctRekombinasiMurni });
  if (sisaAir > 0.1) o2.push({ text: 'Air', pct: sisaAir });
  others.forEach(function (o) { o2.push({ text: escapeHtmlServer_(o.name) + ' (' + fmt(o.pct) + '%)', pct: o.pct }); });
  if (premix > 0) o2.push({ text: 'Premix Vitamin & Mineral', pct: premix });
  sortDesc(o2);
  var opt2 = o2.map(function (i) { return i.text; }).join(', ') + allergen;

  // Opsi 3: Gabung Susu
  var totalSusuGabungan = rawMilk + totalPadatan;
  var o3 = [];
  if (totalSusuGabungan > 0) o3.push({ text: '<strong>' + teksGabung + '</strong> (' + fmt(totalSusuGabungan) + '%)', pct: totalSusuGabungan });
  if (water > 0) o3.push({ text: 'Air', pct: water });
  others.forEach(function (o) { o3.push({ text: escapeHtmlServer_(o.name) + ' (' + fmt(o.pct) + '%)', pct: o.pct }); });
  if (premix > 0) o3.push({ text: 'Premix Vitamin & Mineral', pct: premix });
  sortDesc(o3);
  var opt3 = o3.map(function (i) { return i.text; }).join(', ') + allergen;

  // Opsi 4: Padatan Susu Sapi terpisah
  var o4 = [];
  if (rawMilk > 0) o4.push({ text: '<strong>Susu Segar</strong> (' + fmt(rawMilk) + '%)', pct: rawMilk });
  if (totalPadatan > 0) o4.push({ text: '<strong>Padatan Susu Sapi</strong> (' + fmt(totalPadatan) + '%)', pct: totalPadatan });
  if (water > 0) o4.push({ text: 'Air', pct: water });
  others.forEach(function (o) { o4.push({ text: escapeHtmlServer_(o.name) + ' (' + fmt(o.pct) + '%)', pct: o.pct }); });
  if (premix > 0) o4.push({ text: 'Premix Vitamin & Mineral', pct: premix });
  sortDesc(o4);
  var opt4 = o4.map(function (i) { return i.text; }).join(', ') + allergen;

  return [
    { id: 'opt1', title: '1. Standar (QUID)', text: opt1 },
    { id: 'opt2', title: '2. Rekombinasi (Indomilk)', text: opt2 },
    { id: 'opt3', title: '3. Gabung Susu (FF)', text: opt3 },
    { id: 'opt4', title: '4. Padatan Susu (Dancow)', text: opt4 }
  ];
}

function escapeHtmlServer_(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// ============================================================================
// API — REGENERATE LABEL (untuk resep lama yang belum punya labelText)
// ============================================================================
function api_regenerateRecipeLabel(recipeId) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    var rmList = parseRawMaterial();
    var labelText = generateLabelOptionsServer_(recipe.composition || {}, rmList);

    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: recipe.status,
      Version: recipe.version,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: nowIso_(),
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes
    };

    writeRecipeRow_(merged);
    invalidateInitialDataCache_();

    return { ok: true, labelText: labelText };
  } catch (e) {
    Logger.log('api_regenerateRecipeLabel error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}
// ============================================================
// TAB: QUALITY METRICS (Prediksi vs Aktual)
// ============================================================
function renderRecipeDetailQualityTab(recipe) {
  const stored = recipe.actualQualityMetrics || {};
  const predicted = stored.predicted || {};
  const actual = stored.actual || {};
  const delta = stored.delta || {};

  // Fallback: hitung prediksi dari recipe.qualityMetrics (jika ada dari formula asli)
  if (!predicted.pH && recipe.qualityMetrics) {
    const qm = recipe.qualityMetrics;
    predicted.pH = qm.pH;
    predicted.pHStatus = qm.pHStatus;
    predicted.brix = qm.brix;
    predicted.totalSolid = qm.totalSolid;
    predicted.viscosityCP = qm.viscosityEstimateCP;
    predicted.viscosityCategory = qm.viscosityCategory;
    predicted.stabilizerPct = qm.stabilizerPct;
  }

  const isOwner = RECIPE_APP.isOwner;

  // Delta thresholds
  function deltaBadge(key, val, goodThreshold, warnThreshold) {
    if (val === null || val === undefined) return '<span class="text-gray-400">—</span>';
    const abs = Math.abs(val);
    let cls = 'badge-ok', label = '✓ OK';
    if (abs > warnThreshold) { cls = 'badge-High'; label = '⚠ Cek'; }
    else if (abs > goodThreshold) { cls = 'badge-Medium'; label = 'Δ'; }
    const sign = val > 0 ? '+' : '';
    return '<span class="badge ' + cls + '">' + label + ' (' + sign + fmtNum(val, 3) + ')</span>';
  }

  function renderRow(key, label, unit, predictedVal, actualVal, deltaVal, thresholds) {
    const predStr = (predictedVal !== undefined && predictedVal !== null) ? fmtNum(predictedVal, 2) : '-';
    const actStr = (actualVal !== undefined && actualVal !== null) ? fmtNum(actualVal, 2) : '<span class="text-gray-400">belum diisi</span>';
    const inputId = 'qm_input_' + key;
    const isEditable = isOwner;
    return '<tr class="border-b">' +
      '<td class="py-1 px-1 text-xs font-semibold">' + escapeHtml(label) + '</td>' +
      '<td class="py-1 px-1 text-xs text-center text-gray-700">' + predStr + ' <span class="text-[10px] text-gray-500">' + escapeHtml(unit) + '</span></td>' +
      '<td class="py-1 px-1 text-xs text-center">' +
        (isEditable
          ? '<input id="' + inputId + '" type="number" step="0.001" class="border rounded px-1 py-0.5 text-xs w-24" value="' + (actualVal !== undefined && actualVal !== null ? actualVal : '') + '" placeholder="aktual">'
          : actStr) +
      '</td>' +
      '<td class="py-1 px-1 text-xs text-center">' + deltaBadge(key, deltaVal, thresholds.good, thresholds.warn) + '</td>' +
      '</tr>';
  }

  // Table rows
  const rowsHtml =
    renderRow('pH', 'pH', 'pH units', predicted.pH, actual.pH, delta.pH, { good: 0.05, warn: 0.10 }) +
    renderRow('brix', 'Brix', '°Brix', predicted.brix, actual.brix, delta.brix, { good: 0.5, warn: 1.0 }) +
    renderRow('totalSolid', 'Total Solid', 'g/100g', predicted.totalSolid, actual.totalSolid, delta.totalSolid, { good: 0.3, warn: 0.8 }) +
    renderRow('viscosityCP', 'Viskositas', 'cP', predicted.viscosityCP, actual.viscosityCP, delta.viscosityCP, { good: 2, warn: 5 });

  // Status ringkas
  let statusHtml = '';
  const predictedPH = predicted.pH;
  if (predictedPH !== undefined && predictedPH !== null) {
    const phStatusCls = predicted.pHStatus === 'Optimal' ? 'badge-ok' : 'badge-Medium';
    const viscCat = predicted.viscosityCategory || '-';
    statusHtml =
      '<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 text-xs">' +
      '  <div class="p-2 bg-blue-50 rounded border border-blue-200"><b>Prediksi pH:</b> ' + fmtNum(predictedPH, 2) + ' <span class="badge ' + phStatusCls + ' ml-1">' + escapeHtml(predicted.pHStatus || '-') + '</span></div>' +
      '  <div class="p-2 bg-blue-50 rounded border border-blue-200"><b>Prediksi Viskositas:</b> ' + fmtNum(predicted.viscosityCP, 2) + ' cP <span class="badge badge-Medium ml-1">' + escapeHtml(viscCat) + '</span></div>' +
      '  <div class="p-2 bg-blue-50 rounded border border-blue-200"><b>Stabilizer %:</b> ' + fmtNum(predicted.stabilizerPct, 3) + '%</div>' +
      '</div>';
  }

  // Notes
  const notesVal = actual.notes || '';
  const notesHtml =
    '<div class="mt-3">' +
    '  <label class="form-label text-xs">Catatan Pengukuran (opsional)</label>' +
    (isOwner
      ? '<textarea id="qm_notes" class="form-input" rows="2" placeholder="Alat ukur, kondisi sampel, catatan trial…">' + escapeHtml(notesVal) + '</textarea>'
      : '<div class="p-2 bg-gray-50 rounded text-xs whitespace-pre-wrap">' + (notesVal ? escapeHtml(notesVal) : '<span class="text-gray-400">(tidak ada catatan)</span>') + '</div>') +
    '</div>';

  // Save button (hanya owner)
  const saveHtml = isOwner
    ? '<div class="mt-3 flex justify-end">' +
      '  <button id="btnSaveQuality" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium">💾 Simpan Aktual</button>' +
      '</div>'
    : '<div class="mt-3 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">Read-only (bukan pemilik). Hanya pemilik yang bisa mengisi aktual.</div>';

  // Last updated
  let updatedInfo = '';
  if (actual.updatedAt) {
    updatedInfo = '<div class="text-[11px] text-gray-500 mb-2">Terakhir diupdate: ' + escapeHtml(actual.updatedAt.replace('T', ' ').substring(0, 19)) + ' oleh ' + escapeHtml(actual.updatedBy || '-') + '</div>';
  }

  return (
    '<h3 class="font-semibold mb-2">📊 Quality Metrics — Prediksi vs Aktual</h3>' +
    '<p class="text-xs text-gray-500 mb-3">Prediksi dari model (estimateQualityMetrics), aktual diisi dari hasil lab / trial produksi.</p>' +
    updatedInfo +
    statusHtml +
    '<div class="overflow-x-auto mb-3">' +
    '<table class="w-full"><thead><tr class="bg-gray-100">' +
    '<th class="text-left py-1 px-1 text-xs">Parameter</th>' +
    '<th class="text-center py-1 px-1 text-xs">Prediksi</th>' +
    '<th class="text-center py-1 px-1 text-xs">Aktual</th>' +
    '<th class="text-center py-1 px-1 text-xs">Delta</th>' +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '</div>' +
    notesHtml +
    saveHtml
  );
}

function bindQualityTabEvents(recipe) {
  const btnSave = document.getElementById('btnSaveQuality');
  if (!btnSave) return;
  btnSave.addEventListener('click', async function () {
    const actual = {
      pH: document.getElementById('qm_input_pH') ? document.getElementById('qm_input_pH').value : '',
      brix: document.getElementById('qm_input_brix') ? document.getElementById('qm_input_brix').value : '',
      totalSolid: document.getElementById('qm_input_totalSolid') ? document.getElementById('qm_input_totalSolid').value : '',
      viscosityCP: document.getElementById('qm_input_viscosityCP') ? document.getElementById('qm_input_viscosityCP').value : '',
      notes: document.getElementById('qm_notes') ? document.getElementById('qm_notes').value : ''
    };
    // Konversi string kosong ke null
    ['pH', 'brix', 'totalSolid', 'viscosityCP'].forEach(function (k) {
      if (actual[k] === '') actual[k] = null;
    });

    // Minimal harus ada 1 nilai aktual
    const hasAny = ['pH', 'brix', 'totalSolid', 'viscosityCP'].some(function (k) { return actual[k] !== null && actual[k] !== ''; });
    if (!hasAny) {
      showToast('Isi minimal satu nilai aktual', 'warn');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = '⏳ Menyimpan…';
    try {
      const res = await callApi('api_saveActualQualityMetrics', [recipe.recipeId, actual], 20000);
      if (!res || !res.ok) throw new Error((res && res.error) || 'Gagal simpan');
      // Update local cache
      RECIPE_APP.detail.actualQualityMetrics = res.stored;
      showToast('✅ Quality metrics tersimpan', 'success');
      renderRecipeDetailTabContent();
    } catch (e) {
      showToast('Gagal: ' + e.message, 'error');
      btnSave.disabled = false;
      btnSave.textContent = '💾 Simpan Aktual';
    }
  });
}
// ============================================================================
// API — CREATE MANUAL RECIPE (formulasi independen)
// @param {Object} payload - {
//   recipeName, productId (opsional), composition (obj RMID->pct),
//   notes, waterParams (opsional)
// }
// ============================================================================
function api_createManualRecipe(payload) {
  try {
    payload = payload || {};
    var recipeName = String(payload.recipeName || '').trim();
    if (!recipeName) return { ok: false, error: 'Nama resep wajib diisi' };
    if (recipeName.length > 100) return { ok: false, error: 'Nama resep maksimal 100 karakter' };

    var composition = payload.composition || {};
    var rmids = Object.keys(composition);
    if (rmids.length === 0) return { ok: false, error: 'Komposisi tidak boleh kosong' };

    // Normalisasi & validasi total = 100%
    var totalPct = 0;
    var normalizedComp = {};
    rmids.forEach(function (rmid) {
      var pct = Number(composition[rmid]);
      if (isNaN(pct) || pct < 0) return;
      if (pct > 0) {
        normalizedComp[rmid] = Math.round(pct * 1000) / 1000;
        totalPct += pct;
      }
    });
    if (Math.abs(totalPct - 100) > 0.5) {
      return { ok: false, error: 'Total komposisi = ' + totalPct.toFixed(2) + '%. Harus 100% ± 0.5%.' };
    }

    var rmList = parseRawMaterial();
    var activeRM = filterActiveRM_(rmList, Object.keys(normalizedComp));
    var missing = Object.keys(normalizedComp).filter(function (rmid) {
      return !rmList.some(function (r) { return r.rmid === rmid; });
    });
    if (missing.length > 0) {
      return { ok: false, error: 'RMID tidak ditemukan: ' + missing.join(', ') };
    }

    // === 1. Hitung nutrisi & HPP dari komposisi ===
    var nutritionPer100g = computeNutritionFromComposition(normalizedComp, activeRM);

    var productId = String(payload.productId || '').trim();
    var product = null;
    var density = DEFAULT_DENSITY;
    var productTarget = {};
    if (productId) {
      var products = parseProduct();
      product = products.filter(function (p) { return p.productId === productId; })[0];
      if (product) {
        density = product.density || DEFAULT_DENSITY;
        productTarget = product.target || {};
      }
    }
    var nutritionPer100ml = nutritionPer100ml_(nutritionPer100g, density);

    var servingCfg = parseServingSettings();
    var servingMl = safeNum_(servingCfg.defaultServingMl) || DEFAULT_SERVING_ML;
    var cost = computeCost_(normalizedComp, activeRM, density, servingMl);

    // === 2. Evaluasi (hanya jika produk dipilih) ===
    var nutriLevel = {};
    var pilihanSehat = {};
    var stabilityWarnings = [];
    var fourEngineSummary = null;
    var premixRec = {};

    if (product) {
      try {
        var nutriRules = parseNutriLevelRules();
        var psRules = parsePilihanSehatRules();
        nutriLevel = gradeNutriLevel_(nutritionPer100ml, nutriRules, 'fatTotal', product);
        pilihanSehat = evaluatePilihanSehat_(nutritionPer100ml, product.category, psRules, product);
      } catch (e) { Logger.log('Manual recipe evaluate error: ' + e.message); }

      try {
        var stabilityRules = parseStabilityRule();
        stabilityWarnings = evaluateStability_(nutritionPer100ml, normalizedComp, stabilityRules);
      } catch (e) { Logger.log('Manual recipe stability error: ' + e.message); }

      try {
        var algRef = parseAlgReference();
        var premixes = parsePremix();
        premixRec = computePremixGap_(nutritionPer100ml, product, premixes, servingMl, algRef);
      } catch (e) { Logger.log('Manual recipe premix error: ' + e.message); }
    }

    // === 3. Generate process procedure default (LANGKAH 4: per ProductType) ===
    var processProcedure = generateDefaultProcessProcedure_({
      composition: normalizedComp,
      productType: product ? product.productType : 'UHT'
    });

    // === 4. Generate label QUID ===
    var labelText = [];
    try {
      labelText = generateLabelOptionsServer_(normalizedComp, rmList);
    } catch (e) { Logger.log('Manual recipe label error: ' + e.message); }

    // === 5. Simpan ke recipe_bank ===
    var recipeId = generateRecipeId_();
    var now = nowIso_();
    var userEmail = getCurrentUserEmail_();
    var waterParams = payload.waterParams || WATER_PARAMS_DEFAULT;

    var rowPayload = {
      RecipeID: recipeId,
      RecipeName: recipeName,
      ProductID: productId || '',
      ProductName: product ? (product.product || '') : '',
      BPOMCategory: product ? (product.category || '') : '',
      Status: 'Draft',
      Version: 1,
      ParentRecipeID: '',
      CreatedAt: now,
      UpdatedAt: now,
      CreatedBy: userEmail,
      CompositionJSON: normalizedComp,
      TargetNutritionJSON: productTarget,
      ActualNutritionJSON: nutritionPer100ml,
      HPPJSON: {
        perKg: cost.hppPerKg,
        perLiter: cost.hppPerLiter,
        perSaji: cost.hppPerSaji,
        breakdown: cost.breakdown
      },
      NutriLevelJSON: nutriLevel,
      PilihanSehatJSON: pilihanSehat,
      StabilityWarningsJSON: stabilityWarnings,
      FourEngineJSON: fourEngineSummary,
      PremixRecommendationJSON: premixRec,
      ProcessProcedureJSON: processProcedure,
      LabelTextJSON: labelText,
      ActualQualityMetricsJSON: {},
      StabilityTestJSON: [],
      WaterParamsJSON: waterParams,
      Notes: String(payload.notes || '').trim(),
      Source: 'Manual'
    };

    writeRecipeRow_(rowPayload);
    invalidateInitialDataCache_();

    return {
      ok: true,
      recipeId: recipeId,
      message: 'Resep manual "' + recipeName + '" berhasil dibuat' + (product ? '' : ' (tanpa produk target)')
    };
  } catch (e) {
    Logger.log('api_createManualRecipe error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}
// ============================================================================
// API — STABILITY TEST LOG (batch per fase)
// @param {string} recipeId
// @param {Object} batchPayload - {
//   testPhase: 'D0' | 'D7' | 'D28' | ...,
//   testDate: ISO date string,
//   tests: [{ parameter, value, acceptanceCriteria, status, notes }],
//   notes: string (catatan keseluruhan fase)
// }
// ============================================================================
function api_saveStabilityPhase(recipeId, batchPayload) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    batchPayload = batchPayload || {};
    var testPhase = String(batchPayload.testPhase || '').trim();
    if (!testPhase) return { ok: false, error: 'testPhase wajib' };
    var tests = batchPayload.tests || [];
    if (!Array.isArray(tests)) return { ok: false, error: 'tests harus array' };

    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    // Ambil existing tests, hapus yang fase sama, tambahkan yang baru
    var allTests = (recipe.stabilityTest || []).filter(function (t) {
      return t.testPhase !== testPhase;
    });

    var now = nowIso_();
    tests.forEach(function (t) {
      allTests.push({
        testPhase: testPhase,
        testDate: String(batchPayload.testDate || now).trim(),
        parameter: String(t.parameter || '').trim(),
        value: t.value !== undefined ? t.value : '',
        acceptanceCriteria: String(t.acceptanceCriteria || '').trim(),
        status: String(t.status || 'Pending').trim(),
        notes: String(t.notes || '').trim(),
        recordedAt: now,
        recordedBy: currentUser
      });
    });

    // Update recipe_bank
    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: recipe.status,
      Version: recipe.version,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: now,
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: allTests,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes,
      Source: recipe.source || 'Adopted'
    };
    writeRecipeRow_(merged);

    // Append audit trail ke sheet recipe_stability_tests
    try {
      var testSheet = getSpreadsheet_().getSheetByName(RECIPE_TESTS_SHEET);
      if (testSheet) {
        tests.forEach(function (t) {
          testSheet.appendRow([
            recipeId,
            testPhase,
            String(batchPayload.testDate || now).trim(),
            String(t.parameter || '').trim(),
            t.value !== undefined ? t.value : '',
            String(t.acceptanceCriteria || '').trim(),
            String(t.status || 'Pending').trim(),
            String(t.notes || '').trim()
          ]);
        });
      }
    } catch (e) { Logger.log('append recipe_stability_tests error: ' + e.message); }

    invalidateInitialDataCache_();

    return {
      ok: true,
      recipeId: recipeId,
      testPhase: testPhase,
      totalTests: allTests.length,
      phaseTests: tests.length
    };
  } catch (e) {
    Logger.log('api_saveStabilityPhase error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// API — HAPUS 1 FASE STABILITY TEST
// ============================================================================
function api_deleteStabilityPhase(recipeId, testPhase) {
  try {
    if (!recipeId || !testPhase) return { ok: false, error: 'recipeId & testPhase wajib' };
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    var remaining = (recipe.stabilityTest || []).filter(function (t) {
      return t.testPhase !== testPhase;
    });

    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: recipe.status,
      Version: recipe.version,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: nowIso_(),
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: remaining,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes,
      Source: recipe.source || 'Adopted'
    };
    writeRecipeRow_(merged);
    invalidateInitialDataCache_();
    return { ok: true };
  } catch (e) {
    Logger.log('api_deleteStabilityPhase error: ' + e.message);
    return { ok: false, error: e.message };
  }
}
// ============================================================================
// API — LIST RECIPE VERSIONS (History)
// ============================================================================
function api_listRecipeVersions(recipeId) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(RECIPE_VERSIONS_SHEET);
    if (!sheet) return { ok: true, versions: [], total: 0 };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, versions: [], total: 0 };

    var headers = getSheetHeaders_(sheet);
    var idIdx = headers.indexOf('RecipeID');
    var verIdx = headers.indexOf('Version');
    var dateIdx = headers.indexOf('ChangedAt');
    var byIdx = headers.indexOf('ChangedBy');
    var notesIdx = headers.indexOf('ChangeNotes');

    var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var versions = [];
    data.forEach(function (row) {
      if (String(row[idIdx]).trim() !== recipeId) return;
      versions.push({
        version: safeNum_(row[verIdx]),
        changedAt: String(row[dateIdx] || ''),
        changedBy: String(row[byIdx] || ''),
        changeNotes: String(row[notesIdx] || ''),
        // snapshot JSON tidak dikirim ke client (bisa besar) — hanya meta
        hasSnapshot: true
      });
    });

    // Sort desc by version
    versions.sort(function (a, b) { return b.version - a.version; });

    // Ambil current version dari recipe_bank
    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    var currentVersion = recipe ? (recipe.version || 1) : 1;

    return { ok: true, versions: versions, total: versions.length, currentVersion: currentVersion };
  } catch (e) {
    Logger.log('api_listRecipeVersions error: ' + e.message);
    return { ok: false, error: e.message };
  }
}
// ============================================================================
// API — ROLLBACK TO SPECIFIC VERSION
// Ambil snapshot versi lama dari recipe_versions, jadikan data saat ini.
// ============================================================================
function api_rollbackRecipeVersion(recipeId, targetVersion) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var targetVer = safeNum_(targetVersion);
    if (targetVer <= 0) return { ok: false, error: 'targetVersion tidak valid' };

    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    // Cari snapshot di sheet recipe_versions
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(RECIPE_VERSIONS_SHEET);
    if (!sheet) return { ok: false, error: 'Sheet recipe_versions tidak ditemukan' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Belum ada versi tersimpan' };

    var headers = getSheetHeaders_(sheet);
    var idIdx = headers.indexOf('RecipeID');
    var verIdx = headers.indexOf('Version');
    var snapIdx = headers.indexOf('SnapshotJSON');

    var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var snapshot = null;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][idIdx]).trim() === recipeId && safeNum_(data[i][verIdx]) === targetVer) {
        try {
          snapshot = JSON.parse(data[i][snapIdx]);
        } catch (e) {
          return { ok: false, error: 'Snapshot JSON rusak: ' + e.message };
        }
        break;
      }
    }
    if (!snapshot) return { ok: false, error: 'Versi ' + targetVer + ' tidak ditemukan di history' };

    // Snapshot state SEBELUM rollback (supaya bisa rollback balik)
    var currentSnapshotJson = JSON.stringify({
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: recipe.status,
      Version: recipe.version,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes,
      Source: recipe.source || 'Adopted'
    });

    var now = nowIso_();
    // Append state sebelum rollback (jaga-jaga)
    sheet.appendRow([
      recipeId,
      recipe.version || 1,
      now,
      currentUser,
      'Auto-snapshot sebelum rollback ke v' + targetVer,
      currentSnapshotJson
    ]);

    // Update recipe_bank dengan data dari snapshot
    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: snapshot.RecipeName || recipe.recipeName,
      ProductID: snapshot.ProductID || recipe.productId,
      ProductName: snapshot.ProductName || recipe.productName,
      BPOMCategory: snapshot.BPOMCategory || recipe.bpomCategory,
      Status: recipe.status,
      Version: (recipe.version || 1) + 1,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: now,
      CreatedBy: recipe.createdBy,
      CompositionJSON: snapshot.CompositionJSON || recipe.composition,
      TargetNutritionJSON: snapshot.TargetNutritionJSON || recipe.targetNutrition,
      ActualNutritionJSON: snapshot.ActualNutritionJSON || recipe.actualNutrition,
      HPPJSON: snapshot.HPPJSON || recipe.hpp,
      NutriLevelJSON: snapshot.NutriLevelJSON || recipe.nutriLevel,
      PilihanSehatJSON: snapshot.PilihanSehatJSON || recipe.pilihanSehat,
      StabilityWarningsJSON: snapshot.StabilityWarningsJSON || recipe.stabilityWarnings,
      FourEngineJSON: snapshot.FourEngineJSON || recipe.fourEngineSummary,
      PremixRecommendationJSON: snapshot.PremixRecommendationJSON || recipe.premixRecommendation,
      ProcessProcedureJSON: snapshot.ProcessProcedureJSON || recipe.processProcedure,
      LabelTextJSON: snapshot.LabelTextJSON || recipe.labelText,
      ActualQualityMetricsJSON: snapshot.ActualQualityMetricsJSON || recipe.actualQualityMetrics,
      StabilityTestJSON: snapshot.StabilityTestJSON || recipe.stabilityTest,
      WaterParamsJSON: snapshot.WaterParamsJSON || recipe.waterParams,
      Notes: snapshot.Notes || recipe.notes,
      Source: recipe.source || 'Adopted'
    };
    writeRecipeRow_(merged);
    invalidateInitialDataCache_();

    return {
      ok: true,
      newVersion: merged.Version,
      restoredFrom: targetVer,
      recipeId: recipeId,
      message: 'Rollback ke v' + targetVer + ' berhasil. Versi baru: v' + merged.Version + '.'
    };
  } catch (e) {
    Logger.log('api_rollbackRecipeVersion error: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}
// ============================================================================
// API — UPDATE RECIPE STATUS (quick action)
// ============================================================================
function api_updateRecipeStatus(recipeId, newStatus) {
  try {
    if (!recipeId) return { ok: false, error: 'recipeId wajib' };
    var validStatuses = ['Draft', 'Trial', 'Approved', 'Archived'];
    var status = String(newStatus || '').trim();
    if (validStatuses.indexOf(status) < 0) {
      return { ok: false, error: 'Status harus salah satu: ' + validStatuses.join(', ') };
    }

    var recipes = parseRecipeBank();
    var recipe = recipes.filter(function (r) { return r.recipeId === recipeId; })[0];
    if (!recipe) return { ok: false, error: 'Resep tidak ditemukan' };

    var currentUser = getCurrentUserEmail_();
    if (recipe.createdBy !== currentUser && recipe.createdBy !== 'unknown@local') {
      return { ok: false, error: 'Anda bukan pemilik resep ini.' };
    }

    var merged = {
      RecipeID: recipe.recipeId,
      RecipeName: recipe.recipeName,
      ProductID: recipe.productId,
      ProductName: recipe.productName,
      BPOMCategory: recipe.bpomCategory,
      Status: status,
      Version: recipe.version,
      ParentRecipeID: recipe.parentRecipeId,
      CreatedAt: recipe.createdAt,
      UpdatedAt: nowIso_(),
      CreatedBy: recipe.createdBy,
      CompositionJSON: recipe.composition,
      TargetNutritionJSON: recipe.targetNutrition,
      ActualNutritionJSON: recipe.actualNutrition,
      HPPJSON: recipe.hpp,
      NutriLevelJSON: recipe.nutriLevel,
      PilihanSehatJSON: recipe.pilihanSehat,
      StabilityWarningsJSON: recipe.stabilityWarnings,
      FourEngineJSON: recipe.fourEngineSummary,
      PremixRecommendationJSON: recipe.premixRecommendation,
      ProcessProcedureJSON: recipe.processProcedure,
      LabelTextJSON: recipe.labelText,
      ActualQualityMetricsJSON: recipe.actualQualityMetrics,
      StabilityTestJSON: recipe.stabilityTest,
      WaterParamsJSON: recipe.waterParams,
      Notes: recipe.notes,
      Source: recipe.source || 'Adopted'
    };
    writeRecipeRow_(merged);
    invalidateInitialDataCache_();

    return { ok: true, recipeId: recipeId, status: status };
  } catch (e) {
    Logger.log('api_updateRecipeStatus error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function generateNextId_(sheetName, idColumn, prefix) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return prefix + '001';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + '001';
  
  var headers = getSheetHeaders_(sheet);
  var idIdx = headers.indexOf(idColumn);
  if (idIdx < 0) return prefix + '001';
  
  var ids = sheet.getRange(2, idIdx + 1, lastRow - 1, 1).getValues()
    .map(function (row) { return String(row[0]).trim(); })
    .filter(function (id) { return id.startsWith(prefix); });
    
  if (ids.length === 0) return prefix + '001';
  
  var maxNum = 0;
  ids.forEach(function (id) {
    var numPart = parseInt(id.replace(prefix, ''), 10);
    if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
  });
  
  var nextNum = maxNum + 1;
  return prefix + ('000' + nextNum).slice(-3);
}

// ============================================================================
// END OF recipe.gs v1.0.0
// ============================================================================
