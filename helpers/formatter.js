const phoneNumberFormatter = (number) => {
  // menghilangkan karakter selain angka
  let formatted = number.replace(/\D/g, '');

  //menghilangkan angka 0 di depan
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substr(1);
  }

  // menambahkan @c.us
  if (!formatted.endsWith('@c.us')) {
    formatted += '@c.us';
  }
  
  return formatted;
}

module.exports = {
  phoneNumberFormatter
}