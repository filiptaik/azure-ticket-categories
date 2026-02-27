import assert from 'node:assert/strict';
import test from 'node:test';
import mappingData from '../src/common/mappings/feature-catalogue.mapping.json';
import {
  getFeatureLeafMapping,
  getFeatureNamesForModule,
  IFeatureCatalogueMapping,
} from '../src/common/feature-catalogue';

const mapping = mappingData as IFeatureCatalogueMapping;

test('filters Feature Name values by selected Module', () => {
  const rentalFeatureNames = getFeatureNamesForModule(mapping, 'Rental');

  assert.ok(rentalFeatureNames.includes('Rental Contract'));
  assert.ok(rentalFeatureNames.includes('Rental Planner Board'));
  assert.equal(rentalFeatureNames.includes('Create CSO from Equipment'), false);
});

test('leaf mapping auto-fill resolves Feature ID, Category, and Area', () => {
  const leaf = getFeatureLeafMapping(mapping, 'Rental', 'Rental Contract');

  assert.ok(leaf);
  assert.equal(leaf!.featureId, 'RENT-007');
  assert.equal(leaf!.category, 'Rental');
  assert.equal(leaf!.area, 'Modules');
});

test('ambiguous module still derives Category from selected feature leaf', () => {
  const supportLeaf = getFeatureLeafMapping(mapping, 'Actions on Mobile App', 'Case View');
  const cmmsLeaf = getFeatureLeafMapping(mapping, 'Actions on Mobile App', 'Equipment Page');

  assert.ok(supportLeaf);
  assert.ok(cmmsLeaf);
  assert.equal(supportLeaf!.category, 'Support');
  assert.equal(cmmsLeaf!.category, 'CMMS');
});
