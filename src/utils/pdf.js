import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export async function exportElementToPdf(element, { title = 'Laporan', filename = 'laporan.pdf' } = {}) {
  if (!element) throw new Error('Element tidak ditemukan')

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true
  })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF('p', 'pt', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const marginX = 32
  const marginY = 32
  const headerHeight = 64
  const footerHeight = 32
  const contentTop = headerHeight + marginY
  const contentBottomMargin = footerHeight + marginY

  const imgWidth = pageWidth - marginX * 2
  const imgHeight = canvas.height * imgWidth / canvas.width

  // Header pertama
  pdf.setFillColor(248, 250, 252)
  pdf.rect(0, 0, pageWidth, headerHeight, 'F')
  pdf.setTextColor(30, 41, 59)
  pdf.setFontSize(16)
  pdf.text(title, marginX, headerHeight - 24)

  let y = contentTop
  pdf.addImage(imgData, 'PNG', marginX, y, imgWidth, imgHeight)

  let heightLeft = imgHeight - (pageHeight - y - contentBottomMargin)

  while (heightLeft > 0) {
    pdf.addPage()
    // Header halaman berikutnya
    pdf.setFillColor(248, 250, 252)
    pdf.rect(0, 0, pageWidth, headerHeight, 'F')
    pdf.setTextColor(100, 116, 139)
    pdf.setFontSize(12)
    pdf.text(title, marginX, headerHeight - 24)

    y = marginY
    pdf.addImage(imgData, 'PNG', marginX, y - (imgHeight - heightLeft), imgWidth, imgHeight)
    heightLeft -= pageHeight - y - contentBottomMargin
  }

  // Footer dengan nomor halaman dan timestamp
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setTextColor(148, 163, 184)
    pdf.setFontSize(10)
    pdf.text(`Halaman ${i}/${pages}`, pageWidth - marginX - 100, pageHeight - marginY / 2)
    pdf.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, marginX, pageHeight - marginY / 2)
  }

  pdf.save(filename)
}
