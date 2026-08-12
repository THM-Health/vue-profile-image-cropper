import { _arrayBufferToBase64, _compareBase64Images } from '../support/utils/fileHelper.js';

describe('Profile image cropper demo', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads the demo shell', () => {
    cy.contains('h1', 'Profile image cropper').should('be.visible');
    cy.contains('button', 'Choose image').should('be.visible');
    cy.contains('Select an image to crop your profile photo').should('be.visible');
  });

  it('uploads an image, zooms, crops, and shows a square preview', () => {
    cy.get('input[type="file"]').selectFile('cypress/fixtures/profile.png', { force: true });

    cy.get('[role="application"]', { timeout: 10000 }).should('be.visible');
    cy.get('[role="application"] img', { timeout: 10000 })
      .should('be.visible')
      .and('have.attr', 'src')
      .and('include', 'blob:');

    cy.get('#profile-zoom').should('not.be.disabled').invoke('val', 2).trigger('input');

    cy.contains('2.0×').should('be.visible');

    cy.get('[role="application"]').focus().type('{rightarrow}{rightarrow}{uparrow}');

    cy.contains('button', 'Crop').should('not.be.disabled').click();

    cy.contains(/Cropped square image/).should('be.visible');
    cy.get('img[alt="Cropped square profile image"]').should('be.visible');
    cy.get('img[alt="Cropped image shown in a circular avatar frame"]').should('be.visible');
    cy.contains('button', 'Download cropped image').should('not.be.disabled');
  });

  it('clears the selected image', () => {
    cy.get('input[type="file"]').selectFile('cypress/fixtures/profile.png', { force: true });

    cy.get('[role="application"]').should('exist');
    cy.contains('button', 'Clear').click();
    cy.contains('Select an image to crop your profile photo').should('be.visible');
    cy.get('[role="application"]').should('not.exist');
  });

  it('matches the fixture after 2× zoom and arrow-key panning', () => {
    cy.visit('/');

    cy.get('input[type="file"]').selectFile('cypress/fixtures/profile.png', { force: true });

    cy.get('[role="application"]').should('be.visible');
    cy.get('[role="application"] img').should('be.visible');

    cy.get('#profile-zoom').invoke('val', 2).trigger('input');
    cy.contains('2.0×').should('be.visible');

    cy.get('[role="application"]')
      .focus()
      .type('{rightarrow}{rightarrow}{rightarrow}{leftarrow}{downarrow}{downarrow}{uparrow}');

    cy.contains('button', 'Crop').click();
    cy.contains(/Cropped square image/);

    cy.get('[data-test="cropped-image"]')
      .should('be.visible')
      .should('have.attr', 'src')
      .then((src) => {
        cy.fixture('profile-cropped.png', 'base64').then(async (content) => {
          await _compareBase64Images('data:image/png;base64,' + content, src);
        });
      });
  });
});
