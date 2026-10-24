"""Regression checks for byte-preserving GLB packing, using two real MV sources.

These two-source test approvals never leave work/ and are not production reviews.
No runtime file is written. The production registry still requires all 145 assets.
"""
from pathlib import Path
import copy
import importlib.util
import json
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pack_runtime', ROOT/'art/full-ai-city/tools/pack_runtime.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def receipt(path):
    path = p.local(path)
    return {'path': p.relative(path), 'sha256': p.digest(path)}


def image_bytes(document, binary):
    result = []
    for image in document.get('images', []):
        view = document['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        result.append(binary[offset:offset+view['byteLength']])
    return result


class Packing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        approved = json.loads((ROOT/'art/full-ai-city/approved-assets.json').read_text('utf-8'))
        cls.registry = {'assets': {}}
        cls.names = ('villa_1', 'shop_1')
        for asset, source in zip(cls.names, ('classic/shop_1', 'compact/villa_2')):
            row = copy.deepcopy(approved['assets'][source])
            row['purpose'] = 'TEST FIXTURE ONLY; does not approve any new runtime building'
            cls.registry['assets']['classic/'+asset] = row

    def test_unapproved_missing_authored_and_stale_sources_are_rejected(self):
        for change in ('missing', 'pending', 'authored', 'stale', 'missing_views'):
            registry = copy.deepcopy(self.registry)
            entry = registry['assets']['classic/villa_1']
            if change == 'missing':
                del registry['assets']['classic/villa_1']
            elif change == 'pending':
                entry['status'] = 'exported_pending_visual_review'
            elif change == 'authored':
                entry['sourceType'] = 'blender_three_view'
            elif change == 'stale':
                entry['candidate']['sha256'] = '0'*64
            else:
                entry['reviewViews'] = []
            with self.subTest(change=change), self.assertRaises(ValueError):
                p.verified_entry(registry, 'classic', 'villa_1')

    def test_actual_geometry_textures_and_references_survive_merge(self):
        original = p.ASSETS
        p.ASSETS = self.names
        (ROOT/'work').mkdir(exist_ok=True)
        try:
            with tempfile.TemporaryDirectory(prefix='ai-packer-test-', dir=ROOT/'work') as directory:
                target = Path(directory)/'classic.glb'
                p.pack('classic', self.registry, target)
                document, binary = p.read_glb(target)
                roots = document['scenes'][0]['nodes']
                self.assertEqual([document['nodes'][i]['name'] for i in roots], ['classic_'+name for name in self.names])
                mesh_offset = 0
                for name in self.names:
                    source, source_binary = p.read_glb(p.local(self.registry['assets']['classic/'+name]['candidate']['path']))
                    self.assertTrue(all(image in image_bytes(document, binary) for image in image_bytes(source, source_binary)))
                    for mesh_index, mesh in enumerate(source['meshes']):
                        for primitive_index, primitive in enumerate(mesh['primitives']):
                            packed = document['meshes'][mesh_offset+mesh_index]['primitives'][primitive_index]
                            for semantic in ('POSITION', 'NORMAL', 'TEXCOORD_0'):
                                self.assertIn(semantic, packed['attributes'])
                                original_accessor = source['accessors'][primitive['attributes'][semantic]]
                                packed_accessor = document['accessors'][packed['attributes'][semantic]]
                                self.assertEqual(original_accessor['count'], packed_accessor['count'])
                                a = source['bufferViews'][original_accessor['bufferView']]
                                b = document['bufferViews'][packed_accessor['bufferView']]
                                self.assertEqual(source_binary[a.get('byteOffset', 0):a.get('byteOffset', 0)+a['byteLength']],
                                                 binary[b.get('byteOffset', 0):b.get('byteOffset', 0)+b['byteLength']])
                    mesh_offset += len(source['meshes'])
                for index in roots:
                    root = document['nodes'][index]
                    self.assertEqual(p.matrix(root), p.IDENTITY)
                    individual = copy.deepcopy(document)
                    individual['scenes'] = [{'nodes': [index]}]
                    low, high, triangles = p.measure(individual)
                    self.assertAlmostEqual(low[1], 0, places=6)
                    self.assertAlmostEqual(low[0]+high[0], 0, places=6)
                    self.assertAlmostEqual(low[2]+high[2], 0, places=6)
                    self.assertGreater(triangles, 1000)
                    self.assertLessEqual(high[0]-low[0], .99001)
                    self.assertLessEqual(high[1]-low[1], .78001)
                    self.assertLessEqual(high[2]-low[2], .99001)
        finally:
            p.ASSETS = original

    def test_scaled_aliases_cannot_count_as_separate_generated_buildings(self):
        registry = copy.deepcopy(self.registry)
        registry['assets']['classic/shop_1'] = copy.deepcopy(registry['assets']['classic/villa_1'])
        original = p.ASSETS
        p.ASSETS = self.names
        try:
            with self.assertRaisesRegex(ValueError, 'scaled aliases'):
                p.pack('classic', registry, ROOT/'work/should-not-exist.glb')
        finally:
            p.ASSETS = original
        self.assertFalse((ROOT/'work/should-not-exist.glb').exists())

    def test_frozen_mobile_sources_can_repack_without_local_raw_archives(self):
        # Simulate a fresh checkout without moving or deleting real archives.
        from unittest.mock import patch
        archive_paths = {p.local(json.loads(p.local(row['inferenceReport']['path']).read_text('utf-8'))['output'])
                         for row in self.registry['assets'].values()}
        exists = Path.exists
        with patch.object(Path, 'exists', lambda item: False if item in archive_paths else exists(item)):
            p.verified_entry(self.registry, 'classic', 'villa_1')
            p.verified_entry(self.registry, 'classic', 'shop_1')

    def test_deeper_real_third_level_keeps_uniform_upgrade_growth(self):
        registry = json.loads((ROOT/'art/full-ai-city/approved-assets.json').read_text('utf-8'))
        names = tuple(f'skyscraper_{level}' for level in (1, 2, 3))
        with tempfile.TemporaryDirectory(prefix='ai-upgrade-fit-', dir=ROOT/'work') as directory:
            target = Path(directory)/'classic.glb'
            p.pack('classic', registry, target, names)
            doc, _ = p.read_glb(target)
            heights = []
            for index in doc['scenes'][0]['nodes']:
                node = doc['nodes'][index]
                placement = doc['nodes'][node['children'][0]]
                self.assertEqual(len(set(placement['scale'])), 1, 'source is never stretched')
                individual = copy.deepcopy(doc)
                individual['scenes'] = [{'nodes': [index]}]
                lo, hi, _ = p.measure(individual)
                heights.append(hi[1]-lo[1])
                for size, limit in zip((b-a for a, b in zip(lo, hi)), p.dimensions(node['name'].removeprefix('classic_'))[2]):
                    self.assertLessEqual(size, limit+1e-6)
                self.assertLessEqual(node['extras']['placementReview']['relativeToIndependentFit'], 1)
            self.assertLess(heights[0], heights[1])
            self.assertLess(heights[1], heights[2])
            self.assertAlmostEqual(heights[1]/heights[2], .86, places=5)

    def test_far_height_guide_is_bound_to_the_exact_near_source(self):
        registry = copy.deepcopy(self.registry)
        guides = {}
        for name in self.names:
            row = registry['assets']['classic/'+name]
            row['nearSourceSha256'] = row['candidate']['sha256']
            guides[name] = {'height': .4, 'sourceSha256': row['candidate']['sha256']}
        with tempfile.TemporaryDirectory(prefix='ai-far-fit-', dir=ROOT/'work') as directory:
            target = Path(directory)/'far.glb'
            p.pack('classic', registry, target, self.names, guides)
            manifest = json.loads(target.with_name('far-manifest.json').read_text('utf-8'))
            self.assertTrue(all(row['size'][1] <= .400001 for row in manifest['assets']))
            guides[self.names[0]]['sourceSha256'] = '0'*64
            with self.assertRaisesRegex(ValueError, 'placement guide'):
                p.pack('classic', registry, Path(directory)/'invalid.glb', self.names, guides)
            self.assertFalse((Path(directory)/'invalid.glb').exists())

    def test_changed_placement_cannot_reuse_an_older_scene_review(self):
        # Synthetic receipts exercise the release gate only; they never become
        # model approval or visual evidence in the production registry.
        original_art = p.ART
        try:
            with tempfile.TemporaryDirectory(prefix='ai-scene-gate-', dir=ROOT/'work') as directory:
                p.ART = Path(directory)
                (p.ART/'packed').mkdir()
                package = p.ART/'packed/classic.glb'
                package.write_bytes(b'synthetic original placement')
                view = p.ART/'synthetic-view'
                view.write_bytes(b'synthetic unit fixture; not visual approval')
                hashes = {name: 'a'*64 for name in p.ASSETS}
                registry = {'assets': {'classic/'+name: {'candidate': {'sha256': sha}} for name, sha in hashes.items()}}
                review = {'status': 'approved', 'note': 'Synthetic scene-gate unit fixture only, never production visual approval.',
                          'approvedAssets': hashes, 'groupView': receipt(view), 'portraitGameView': receipt(view),
                          'packedBundles': {'classic.glb': receipt(package)}}
                (p.ART/'regional-review.json').write_text(json.dumps({'maps': {'classic': review}}), 'utf-8')
                p.verified_map_style(registry, 'classic')
                package.write_bytes(b'synthetic changed placement; same individual sources')
                with self.assertRaisesRegex(ValueError, 'current packed placement'):
                    p.verified_map_style(registry, 'classic')
        finally:
            p.ART = original_art


if __name__ == '__main__':
    unittest.main()
