import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github' / 'workflows' / 'scraper.yml'


class ScraperWorkflowConcurrencyContracts(unittest.TestCase):
    def test_all_scraper_runs_share_a_non_cancelling_concurrency_group(self):
        workflow = WORKFLOW.read_text(encoding='utf-8')
        self.assertRegex(workflow, re.compile(r'^concurrency:\s*\n\s+group:\s+fling-trainer-scraper-production\s*\n\s+cancel-in-progress:\s+false', re.MULTILINE))
        self.assertLess(workflow.index('concurrency:'), workflow.index('jobs:'))
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('schedule:', workflow)


if __name__ == '__main__':
    unittest.main()
