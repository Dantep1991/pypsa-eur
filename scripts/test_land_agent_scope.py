"""Test the launcher's pure land interpreter without starting its WSGI server."""
import ast
from pathlib import Path
import re
import unittest

source = ast.parse(Path(__file__).with_name('run_atlas_backend_stable.py').read_text(encoding='utf-8'))
nodes = [node for node in source.body if
         isinstance(node, ast.FunctionDef) and node.name == '_land_agent_params' or
         isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == '_LAND_COUNTRY_ALIASES' for t in node.targets)]
namespace = {'re': re}
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<land-interpreter>', 'exec'), namespace)
interpret = namespace['_land_agent_params']


class LandScopeTests(unittest.TestCase):
    def test_adding_overlay_is_not_adding_countries(self):
        for message in ('add the land overlay in france', 'show French land overlay',
                        'add protected areas in France', 'land overlay in France and Spain'):
            with self.subTest(message=message):
                result = interpret(message)
                self.assertEqual(result['country_mode'], 'replace')
                self.assertIn('FR', result['countries'])

    def test_explicit_addition(self):
        for message in ('also show the land overlay in France', 'add France to the land overlay'):
            self.assertEqual(interpret(message)['country_mode'], 'add')

    def test_clear_and_unspecified_scope(self):
        self.assertEqual(interpret('land overlay for all Europe')['countries'], [])
        self.assertNotIn('countries', interpret('show land overlay'))


if __name__ == '__main__':
    unittest.main()
