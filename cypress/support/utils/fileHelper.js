import pixelmatch from 'pixelmatch';

export async function _compareBase64Images(expectedImageBase64, actualImageBase64) {
  const expectedImage = await _base64ToImageData(expectedImageBase64);
  const actualImage = await _base64ToImageData(actualImageBase64);

  expect(expectedImage.width).to.eql(actualImage.width);
  expect(expectedImage.height).to.eql(actualImage.height);

  const diff2 = pixelmatch(
    expectedImage.data,
    actualImage.data,
    null,
    expectedImage.width,
    expectedImage.height,
    {
      threshold: 0.1,
    },
  );

  expect(diff2).to.be.at.most(
    Math.ceil(expectedImage.width * expectedImage.height * 0.02),
    'Expected Image: ' + expectedImageBase64 + ' Actual Image: ' + actualImageBase64,
  );
}

export async function _base64ToImageData(base64) {
  return await new Promise((res) => {
    const image = new Image();
    image.src = base64;

    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      res(ctx.getImageData(0, 0, width, height));
    };
  });
}
