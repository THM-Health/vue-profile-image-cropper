/**
 * E2E coverage for the demo app: upload, zoom (slider / keys / wheel), pan, crop, clear, debug.
 */
import { _compareBase64Images } from '../support/utils/fileHelper.js';

function uploadFixture(path = 'cypress/fixtures/profile.png') {
  cy.get('input[type="file"]').selectFile(path, { force: true });
  cy.get('[role="application"]', { timeout: 10000 }).should('be.visible');
  cy.get('[role="application"] img', { timeout: 10000 })
    .should('be.visible')
    .and('have.attr', 'src')
    .and('include', 'blob:');
}

describe('Profile image cropper demo', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads the demo shell', () => {
    cy.contains('h1', 'Profile image cropper').should('be.visible');
    cy.contains('button', 'Choose image').should('be.visible');
    cy.contains('button', 'Show debug').should('be.visible');
    cy.contains('Select an image to crop your profile photo').should('be.visible');
  });

  it('uploads an image, zooms with the slider, pans, crops, and shows a preview', () => {
    uploadFixture();

    cy.get('#profile-zoom').should('not.be.disabled').invoke('val', 2).trigger('input');
    cy.contains('2.0×').should('be.visible');

    cy.get('[role="application"]').focus().type('{rightarrow}{rightarrow}{uparrow}');

    cy.contains('button', 'Crop').should('not.be.disabled').click();

    cy.contains(/Cropped square image/).should('be.visible');
    cy.get('img[alt="Cropped square profile image"]').should('be.visible');
    cy.get('img[alt="Cropped image shown in a circular avatar frame"]').should('be.visible');
    cy.contains('button', 'Download cropped image').should('not.be.disabled');
  });

  it('zooms with + / − keys on the focused viewport', () => {
    uploadFixture();

    cy.contains('1.0×').should('be.visible');

    // `=` is accepted as zoom-in (same as +); more reliable than Shift+`+` in Cypress
    cy.get('[role="application"]').focus().type('==');
    cy.contains('1.2×').should('be.visible');

    cy.get('[role="application"]').focus().type('-');
    cy.contains('1.1×').should('be.visible');
  });

  it('zooms with the mouse wheel on the viewport', () => {
    uploadFixture();

    cy.contains('1.0×').should('be.visible');

    // Wheel up (negative deltaY) → zoom in
    cy.get('[role="application"]').trigger('wheel', { deltaY: -100 });
    cy.contains('1.1×').should('be.visible');

    cy.get('[role="application"]').trigger('wheel', { deltaY: 100 });
    cy.contains('1.0×').should('be.visible');
  });

  it('toggles the debug coordinate panel', () => {
    uploadFixture();

    cy.contains('button', 'Show debug').click();
    cy.contains('h2', 'Debug').should('be.visible');
    cy.contains('h3', 'Coordinate system').should('be.visible');
    cy.get('svg[aria-label="Crop-space coordinate diagram with infinite axes"]').should(
      'be.visible',
    );
    cy.contains('h3', 'Values').should('be.visible');

    cy.contains('button', 'Hide debug').click();
    cy.contains('h2', 'Debug').should('not.exist');
  });

  it('clears the selected image', () => {
    uploadFixture();

    cy.contains('button', 'Clear').click();
    cy.contains('Select an image to crop your profile photo').should('be.visible');
    cy.get('[role="application"]').should('not.exist');
  });

  it('matches the fixture after 2× zoom and arrow-key panning', () => {
    uploadFixture();

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
