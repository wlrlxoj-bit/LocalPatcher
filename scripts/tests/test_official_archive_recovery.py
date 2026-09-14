import io
import re
import sys
import pathlib
import unittest
import zipfile
from types import SimpleNamespace
from urllib.parse import parse_qs, quote, urlparse
from unittest.mock import Mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from test_translation_pipeline_contracts import load_functions


class OfficialArchiveRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.requests = SimpleNamespace(get=Mock())
        self.resolve, self.recover = load_functions('scraper.py', [
            'official_archive_from_redirect', 'recover_official_archive',
        ], dict(parse_qs=parse_qs, quote=quote, urlparse=urlparse, re=re,
                requests=self.requests, zipfile=zipfile, io=io))

    def response(self, path='/wp-content/uploads/2026/09/Example.zip', status=403):
        return SimpleNamespace(status_code=status, history=[
            SimpleNamespace(url='https://flingtrainer.com/downloads/example'),
            SimpleNamespace(url='https://flingtrainer.com/download-trainer.php?path=' + quote(path)),
        ])

    def test_uses_only_server_provided_archive(self):
        self.assertEqual(self.resolve(self.response()),
                         'https://flingtrainer.com/wp-content/uploads/2026/09/Example.zip')

    def test_rejects_external_and_unsafe_paths(self):
        for path in ['https://evil.test/a.zip', '/etc/a.zip',
                     '/wp-content/uploads/2026/09/../a.zip',
                     '/wp-content/uploads/2026/09/a%2f.zip',
                     '/wp-content/uploads/2026/09/a\\b.zip']:
            self.assertIsNone(self.resolve(self.response(path)))
        response = self.response()
        response.history[0].url = 'https://evil.test/downloads/example'
        self.assertIsNone(self.resolve(response))

    def test_valid_zip_recovers_and_disallows_redirects(self):
        memory = io.BytesIO()
        with zipfile.ZipFile(memory, 'w') as archive:
            archive.writestr('example.exe', b'MZ-test-only')
        recovered = SimpleNamespace(status_code=200, content=memory.getvalue())
        self.requests.get.return_value = recovered
        self.assertIs(self.recover(self.response(), {}), recovered)
        self.assertFalse(self.requests.get.call_args.kwargs['allow_redirects'])

    def test_html_and_redirect_are_not_success(self):
        for status, content in [(200, b'<html>denied</html>'), (302, b'PK\x03\x04')]:
            self.requests.get.return_value = SimpleNamespace(status_code=status, content=content)
            original = self.response()
            self.assertIs(self.recover(original, {}), original)

    def test_normal_success_does_not_add_request(self):
        original = self.response(status=200)
        self.assertIs(self.recover(original, {}), original)
        self.requests.get.assert_not_called()


if __name__ == '__main__':
    unittest.main()
