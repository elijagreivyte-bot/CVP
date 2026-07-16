// ═══════════════════════════════════════════════════════════
// EXPRESS KONFIGŪRACIJA — DIDELIŲ FAILŲ VALDYMAS
// Padidinkite šias ribas, jei norite priimti didesnius dokumentus
// ═══════════════════════════════════════════════════════════

module.exports = {
  // JSON kūno limitas (pvz. PDF base64, ZIP failai ir kt.)
  jsonLimit: '50mb',
  
  // URL-encoded duomenų limitas
  urlencodedLimit: '50mb',
  
  // Raw duomenų limitas (binariniai failai)
  rawLimit: '50mb',

  // Multer (jei naudojate failų uploadą)
  multerLimits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10,
    fields: 50
  }
};
