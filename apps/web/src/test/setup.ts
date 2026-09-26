import '@testing-library/jest-dom/vitest'

HTMLDialogElement.prototype.showModal ??= function showModal(
  this: HTMLDialogElement,
) {
  this.setAttribute('open', '')
}

HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}
