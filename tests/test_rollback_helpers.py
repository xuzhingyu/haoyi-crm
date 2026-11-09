import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'infra' / 'deploy' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RollbackHelpersTests(unittest.TestCase):
    def test_http_normalization_preserves_unrelated_routes_and_is_idempotent(self):
        module = load('legacy-nginx-entry')
        prefix = 'server {\n    location ^~ /.well-known/acme-challenge/ { root /public; }\n    include tutor-test.locations.inc;\n'
        suffix = '    location / { return 301 https://$host$request_uri; }\n}\n'
        original = prefix + '''    location = /workbench {
        return 308 /workbench/;
    }
    location ^~ /workbench/api/ {
        proxy_pass http://affiliate-workbench-api:8000/api/;
    }
    location ^~ /workbench/ {
        root /public;
        try_files $uri $uri/ /workbench/index.html;
    }
''' + suffix
        converted = module.normalize(original)
        self.assertEqual(converted, prefix + '    ' + module.INCLUDE + '\n' + suffix)
        self.assertEqual(module.normalize(converted), converted)
        with self.assertRaises(ValueError):
            module.normalize(original.replace('location = /workbench {', 'location = /unknown {'))

    def test_http_backup_cannot_be_overwritten_and_restore_uses_compat_api(self):
        module = load('legacy-nginx-entry')
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            module.CONF, module.BACKUP = base / 'conf', base / 'backup'
            module.CONF.mkdir(); module.BACKUP.mkdir()
            baseline = module.INCLUDE + '\n'
            (module.CONF / module.NAME).write_text(baseline)
            module.main('backup')
            with self.assertRaises(ValueError):
                module.main('backup')
            (module.CONF / 'affiliate-workbench.locations.inc').write_text('proxy_pass http://affiliate-workbench-api:8000/api/;')
            module.main('restore')
            self.assertEqual((module.BACKUP / module.NAME).read_text(), baseline)
            self.assertIn('affiliate-workbench-api-rollback:8000', (module.CONF / 'affiliate-workbench.locations.inc').read_text())

    def test_clone_config_has_no_network_or_production_mount(self):
        module = load('legacy-rollback')
        source = {'Image': 'sha256:test', 'Config': {'Cmd': ['server'], 'User': '', 'WorkingDir': '/app'},
                  'NetworkSettings': {'Networks': {'old-net': {}}}, 'HostConfig': {}}
        calls = []
        with patch.object(module, 'docker', side_effect=lambda method, path, data: calls.append(data) or {'Id': 'test'}):
            module.create(source, {'RUN_MIGRATIONS': '0', 'SECRET': 'test-value'}, 'validation', '/safe/clone', True)
        payload = calls[0]
        self.assertEqual(payload['HostConfig']['NetworkMode'], 'none')
        self.assertEqual(payload['HostConfig']['Binds'], ['/safe/clone:/app/data'])
        self.assertNotIn('PortBindings', payload['HostConfig'])
        self.assertEqual(payload['Image'], 'sha256:test')

    def test_source_override_preserves_original_config(self):
        module = load('legacy-rollback')
        source = {'Mounts': [{'Type': 'bind', 'Source': module.DATA, 'Destination': '/app/data'}],
                  'HostConfig': {}, 'Config': {'Env': ['RUN_MIGRATIONS=1', 'DATABASE_URL=sqlite:////app/data/affiliate_workbench.db', 'OTHER=preserved', 'AI_API_KEY=test-only', 'STUDIO_LOCAL_URL=http://model.test', 'STUDIO_LOCAL_KEY=test-only']}}
        with patch.object(module, 'inspect', return_value=source):
            _, env = module.source_config()
        self.assertEqual(env['RUN_MIGRATIONS'], '0')
        self.assertEqual(env['OTHER'], 'preserved')
        self.assertEqual(env['AI_API_KEY'], '')
        self.assertEqual(env['STUDIO_LOCAL_URL'], '')
        self.assertEqual(env['STUDIO_LOCAL_KEY'], '')
        self.assertEqual(env['STUDIO_NEWS_DAILY_LIMIT'], '0')
        self.assertIn('RUN_MIGRATIONS=1', source['Config']['Env'])
        self.assertIn('AI_API_KEY=test-only', source['Config']['Env'])

    def test_apply_rejects_residual_container_with_wrong_environment(self):
        module = load('legacy-rollback')
        source = {'Image': 'sha256:test', 'Config': {'Cmd': ['server'], 'User': '', 'WorkingDir': '/app'},
                  'NetworkSettings': {'Networks': {'old-net': {}}}}
        current = {'Image': 'sha256:test', 'Config': {**source['Config'], 'Env': ['RUN_MIGRATIONS=1'], 'Labels': {'org.haoyi.rollback-only': 'true'}},
                   'Mounts': [{'Type': 'bind', 'Source': module.DATA, 'Destination': '/app/data', 'RW': True}],
                   'NetworkSettings': source['NetworkSettings'], 'HostConfig': {}}
        with tempfile.TemporaryDirectory() as root:
            module.PROOF = Path(root) / 'proof.json'
            module.PROOF.write_text(json.dumps({'source_image': 'sha256:test', 'existing_data_unchanged': True, 'schema_unchanged': True, 'ledger_preserved': True, 'old_models_readable': True, 'cloud_ai_disabled': True}))
            with patch.object(module, 'source_config', return_value=(source, {'RUN_MIGRATIONS': '0'})), patch.object(module, 'inspect', side_effect=lambda name, optional=False: current if name == module.TARGET else {'State': {'Running': False}}), patch.object(module, 'docker') as api:
                with self.assertRaisesRegex(RuntimeError, 'Unexpected rollback container'):
                    module.apply()
                api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
