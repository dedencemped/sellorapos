import jsPDF from 'jspdf'

export function renderReportPdf({
  title = 'LAPORAN',
  company = { name: 'Perusahaan Anda', address: '' },
  logoUrl = null,
  periodLabel = '',
  metaRightLabel = 'Periode',
  table = { headers: [], rows: [] },
  summary = { items: [] },
  theme = { primary: [59, 130, 246], headerBg: [241, 245, 249] },
  showMeta = true,
  showSummary = true,
  noteLines = null,
  signatures = null
}) {
  const pdf = new jsPDF('p', 'pt', 'a4')
  pdf.setFont('helvetica', 'normal')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const marginX = 40
  const marginY = 44
  let headerHeight = 0
  const footerHeight = 36
  let y = marginY

  // Header background removed per request (keep header clean)

  const logoSize = logoUrl ? 40 : 0
  const logoGap = logoUrl ? 12 : 0
  const metaRightX = pageWidth - marginX
  const infoX = marginX + logoSize + logoGap
  const infoWidth = Math.max(220, Math.floor((pageWidth - marginX * 2) * 0.5) - (logoSize + logoGap))
  pdf.setTextColor(30, 41, 59)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  const safeCompanyName = company && company.name ? String(company.name) : ''
  const nameLines = safeCompanyName ? pdf.splitTextToSize(safeCompanyName, infoWidth) : []
  const nameHeight = nameLines.length * 14
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const addressLinesRaw = company && company.address ? pdf.splitTextToSize(String(company.address), infoWidth) : []
  const extraLinesRaw = []
  if (company && company.phone) extraLinesRaw.push(`Telp: ${String(company.phone)}`)
  if (company && company.email) extraLinesRaw.push(`Email: ${String(company.email)}`)
  if (company && company.fax) extraLinesRaw.push(`Fax: ${String(company.fax)}`)
  if (company && company.npwp) extraLinesRaw.push(`NPWP: ${String(company.npwp)}`)
  if (company && company.business_license) extraLinesRaw.push(`Izin Usaha: ${String(company.business_license)}`)
  const addressLines = [...addressLinesRaw, ...extraLinesRaw]
  const addressHeight = addressLines.length > 0 ? addressLines.length * 12 + 4 : 0
  const leftBlockHeight = Math.max(0, nameHeight + addressHeight)
  const topRowHeight = Math.max(logoSize, leftBlockHeight, 44)
  if (logoUrl) {
    const logoTop = y + Math.max(0, Math.floor((topRowHeight - logoSize) / 2))
    try {
      let imgType = 'PNG'
      const l = String(logoUrl || '')
      if (l.startsWith('data:image/jpeg') || l.startsWith('data:image/jpg')) imgType = 'JPEG'
      pdf.addImage(logoUrl, imgType, marginX, logoTop, logoSize, logoSize)
    } catch (_) {}
  }
  if (nameLines.length > 0) {
    pdf.setTextColor(30, 41, 59)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    const nameTop = y + 18
    pdf.text(nameLines, infoX, nameTop)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(71, 85, 105)
    if (showMeta) {
      pdf.text(`${metaRightLabel}: ${periodLabel}`, metaRightX, y + 18, { align: 'right' })
      pdf.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, metaRightX, y + 34, { align: 'right' })
    }
    if (addressLines.length > 0) {
      pdf.setTextColor(55, 65, 81)
      pdf.setFontSize(8)
      const mm4 = 4 * 2.8346
      const nameLineHeight = 14
      const lastNameBaseline = nameTop + Math.max(0, (nameLines.length - 1)) * nameLineHeight
      const addrTop = lastNameBaseline + mm4
      pdf.text(addressLines, infoX, addrTop)
    }
  } else {
    // still show right meta info even without company block
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(71, 85, 105)
    if (showMeta) {
      pdf.text(`${metaRightLabel}: ${periodLabel}`, metaRightX, y + 18, { align: 'right' })
      pdf.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, metaRightX, y + 34, { align: 'right' })
    }
  }
  pdf.setTextColor(30, 41, 59)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  const titleText = String(title || '').toUpperCase()
  const titleWidth = pdf.getTextWidth(titleText)
  const titleY = y + topRowHeight + 18
  pdf.text(titleText, (pageWidth - titleWidth) / 2, titleY)
  pdf.setFont('helvetica', 'normal')
  headerHeight = titleY + 6
  y = headerHeight + 12

  // No table title band (removed per request)

  // Table header
  const tableHeaderFontSize = 8
  const tableBodyFontSize = 8
  const cellPadX = 4
  const cellPadY = 4
  const baseRowHeight = 16
  const lineHeight = 10

  const wrapCellText = (text, maxWidth) => {
    const raw = String(text ?? '')
    const parts = raw.split('\n')
    const lines = []
    for (const part of parts) {
      const wrapped = pdf.splitTextToSize(part, maxWidth)
      for (const w of wrapped) lines.push(w)
    }
    return lines.length > 0 ? lines : ['']
  }

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(tableBodyFontSize)
  const colWidths = computeColumnWidths(pageWidth - marginX * 2, table.headers, table.rows, pdf)
  const numericCols = table.headers.map((h, idx) => {
    const name = String(h || '').toLowerCase()
    if (name.match(/total|jumlah|nominal|bayar|harga|hpp|laba|piutang|utang|saldo|kas|stok|pcs|qty/)) return true
    // Heuristic: if most cells are numeric-like
    let numericCount = 0
    const sampleCount = Math.min(20, table.rows.length)
    for (let r = 0; r < sampleCount; r++) {
      const v = table.rows[r]?.[idx]
      if (typeof v === 'number') { numericCount++; continue }
      if (typeof v === 'string' && v.trim().match(/^[\d\.\,\sRpIDR\-]+$/)) numericCount++
    }
    return numericCount >= Math.ceil(sampleCount * 0.6)
  })
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(tableHeaderFontSize)
  pdf.setFont('helvetica', 'bold')
  pdf.setDrawColor(0, 0, 0)
  let x = marginX
  for (let i = 0; i < table.headers.length; i++) {
    pdf.rect(x, y, colWidths[i], baseRowHeight)
    pdf.text(String(table.headers[i]), x + cellPadX, y + baseRowHeight - cellPadY)
    x += colWidths[i]
  }
  pdf.setFont('helvetica', 'normal')
  y += baseRowHeight

  // Table rows
  pdf.setFontSize(tableBodyFontSize)
  for (let r = 0; r < table.rows.length; r++) {
    // compute row height based on wrapped text
    const cellLines = []
    let maxLines = 1
    for (let c = 0; c < table.headers.length; c++) {
      const cellText = String(table.rows[r][c] ?? '')
      const wrapped = wrapCellText(cellText, colWidths[c] - (cellPadX * 2))
      cellLines[c] = wrapped
      if (wrapped.length > maxLines) maxLines = wrapped.length
    }
    const rowHeight = Math.max(baseRowHeight, cellPadY * 2 + maxLines * lineHeight)

    if (y > pageHeight - marginY - footerHeight - rowHeight - 8) {
      addFooter(pdf, { pageWidth, marginX, marginY, footerHeight })
      pdf.addPage()
      // re-draw header basics
      y = marginY
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(0, 0, 0)
      pdf.setDrawColor(0, 0, 0)
      pdf.setFontSize(tableHeaderFontSize)
      x = marginX
      for (let i = 0; i < table.headers.length; i++) {
        pdf.rect(x, y, colWidths[i], baseRowHeight)
        pdf.text(String(table.headers[i]), x + cellPadX, y + baseRowHeight - cellPadY)
        x += colWidths[i]
      }
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(tableBodyFontSize)
      y += baseRowHeight
    }
    x = marginX
    pdf.setDrawColor(200, 200, 200)
    pdf.setTextColor(0, 0, 0)
    for (let c = 0; c < table.headers.length; c++) {
      // cell border
      pdf.rect(x, y, colWidths[c], rowHeight)
      // cell text (wrapped)
      const lines = cellLines[c]
      const textY = y + cellPadY + lineHeight - 2
      const raw = String(table.rows[r][c] ?? '')
      const isMultiLine = raw.includes('\n') || lines.length > 1
      if (numericCols[c] && !isMultiLine) {
        pdf.text(raw, x + colWidths[c] - cellPadX, textY, { align: 'right', maxWidth: colWidths[c] - (cellPadX * 2) })
      } else {
        pdf.text(lines, x + cellPadX, textY, { maxWidth: colWidths[c] - (cellPadX * 2) })
      }
      x += colWidths[c]
    }
    y += rowHeight
  }

  // Summary box
  let boxHeight = 0
  if (showSummary && Array.isArray(summary?.items) && summary.items.length > 0) {
    y += 12
    if (y > pageHeight - marginY - footerHeight - 80) {
      addFooter(pdf, { pageWidth, marginX, marginY, footerHeight })
      pdf.addPage()
      y = marginY
    }
    pdf.setDrawColor(theme.primary[0], theme.primary[1], theme.primary[2])
    pdf.setLineWidth(1)
    const boxWidth = pageWidth - marginX * 2
    boxHeight = Math.max(48, summary.items.length * 18 + 24)
    pdf.rect(marginX, y, boxWidth, boxHeight)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(theme.primary[0], theme.primary[1], theme.primary[2])
    pdf.text('Ringkasan', marginX + 8, y + 16)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(55, 65, 81)
    let sy = y + 34
    summary.items.forEach((it) => {
      pdf.text(`${it.label}: ${it.value}`, marginX + 12, sy)
      sy += 18
    })
  }

  // Optional note under summary
  if (Array.isArray(noteLines) && noteLines.length > 0) {
    let noteTop = y + (boxHeight || 0) + 12
    const neededHeight = noteLines.length * 14 + 8
    if (noteTop > pageHeight - marginY - footerHeight - neededHeight) {
      addFooter(pdf, { pageWidth, marginX, marginY, footerHeight })
      pdf.addPage()
      noteTop = marginY
    }
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(55, 65, 81)
    let ny = noteTop
    for (const line of noteLines) {
      pdf.text(String(line || ''), marginX + 8, ny)
      ny += 14
    }
    y = ny
  }

  // Optional signatures directly below summary/date
  if (Array.isArray(signatures) && signatures.length > 0) {
    const cols = 2
    const colGap = 44
    const colWidth = Math.floor((pageWidth - marginX * 2 - (cols - 1) * colGap) / cols)
    const sigHeight = 110
    y += (boxHeight > 0 ? 20 : 6)
    if (y > pageHeight - marginX - footerHeight - sigHeight) {
      addFooter(pdf, { pageWidth, marginX, marginY, footerHeight })
      pdf.addPage()
      y = marginY
    }
    const labels = [
      signatures[0] || { title: 'Pengirim', name: '' },
      signatures[1] || { title: 'Penerima', name: '' }
    ]
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(30, 41, 59)
    // Titles row
    for (let i = 0; i < cols; i++) {
      const x = marginX + i * (colWidth + colGap)
      const label = String(labels[i].title || `Tanda Tangan ${i + 1}`)
      pdf.text(label, x, y + 16)
    }
    // Signature lines
    const lineY = y + 70
    pdf.setDrawColor(148, 163, 184)
    pdf.setLineWidth(0.8)
    for (let i = 0; i < cols; i++) {
      const x = marginX + i * (colWidth + colGap)
      pdf.line(x, lineY, x + colWidth - 4, lineY)
    }
    // Names hint
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(71, 85, 105)
    for (let i = 0; i < cols; i++) {
      const x = marginX + i * (colWidth + colGap)
      const nm = String(labels[i].name || '').trim()
      if (nm) pdf.text(`(${nm})`, x, lineY + 16)
    }
    y += sigHeight
  }

  addFooter(pdf, { pageWidth, marginX, marginY, footerHeight })
  // Number pages
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setFontSize(9)
    pdf.setTextColor(148, 163, 184)
    const footerCompany = company && company.name ? String(company.name) : ''
    pdf.text(`Halaman ${i}/${pages}  © ${new Date().getFullYear()} ${footerCompany}`, marginX, pageHeight - marginY + 20)
  }

  return pdf
}

function computeColumnWidths(totalWidth, headers, rows, pdf) {
  const minCol = 44
  const maxCol = Math.max(120, Math.floor(totalWidth * 0.55))
  const pad = 10

  // Estimate content width per column
  const desired = headers.map((h, idx) => {
    let maxW = pdf.getTextWidth(String(h || '')) + pad
    // sample up to N rows per column for performance
    const sampleCount = Math.min(rows.length, 200)
    for (let r = 0; r < sampleCount; r++) {
      const cell = rows[r]?.[idx]
      const text = String(cell ?? '')
      // limit extremely long texts to avoid skew
      const sampleText = text.length > 120 ? text.slice(0, 120) + '…' : text
      const w = pdf.getTextWidth(sampleText) + pad
      if (w > maxW) maxW = w
    }
    return Math.max(minCol, Math.min(maxW, maxCol))
  })

  const sumDesired = desired.reduce((a, b) => a + b, 0)
  let widths
  if (sumDesired <= totalWidth) {
    widths = desired
    // distribute remaining space proportionally to medium/large columns
    const remaining = totalWidth - sumDesired
    if (remaining > 0 && widths.length > 0) {
      const weights = widths.map((w, i) => (w > minCol + 10 ? 1 : 0.5))
      const sumW = weights.reduce((a, b) => a + b, 0) || 1
      widths = widths.map((w, i) => w + Math.round(remaining * (weights[i] / sumW)))
      // normalize exact total
      const diff = totalWidth - widths.reduce((a, b) => a + b, 0)
      widths[widths.length - 1] += diff
    }
  } else {
    // scale down proportionally but keep minimums
    const scale = totalWidth / sumDesired
    widths = desired.map(w => Math.max(minCol, Math.floor(w * scale)))
    // ensure exact total width
    const diff = totalWidth - widths.reduce((a, b) => a + b, 0)
    widths[widths.length - 1] += diff
  }
  return widths
}

function addFooter(pdf, { pageWidth, marginX, marginY, footerHeight }) {
  const pageHeight = pdf.internal.pageSize.getHeight()
  pdf.setDrawColor(226, 232, 240)
  pdf.setLineWidth(1)
  pdf.line(marginX, pageHeight - footerHeight, pageWidth - marginX, pageHeight - footerHeight)
  // actual texts per-page are added after creation
}
