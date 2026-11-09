"""Back up/normalize the separate HTTP workbench block without changing ACME/tutor.

Only known workbench location blocks are replaced. Rollback can point their saved
proxy to the separately verified old-image API, preserving original backup files.
"""
import argparse
import os
import re
from pathlib import Path

CONF = Path('/data/docker/nginx/conf')
BACKUP = Path('/opt/haoyi-workspace/shared/integration-rollback')
NAME = 'affiliate-workbench-ip.conf'
INCLUDE = 'include /etc/nginx/conf.d/affiliate-workbench.locations.inc;'
TARGETS = {'/workbench', '/workbench/', '/workbench/api/'}


def normalize(text):
    lines = text.splitlines(keepends=True)
    blocks = []
    index = 0
    while index < len(lines):
        match = re.match(r'^(\s*)location\s+(?:(?:=|\^~)\s+)?(/workbench(?:/api/|/)?)\s*\{', lines[index])
        if not match:
            index += 1
            continue
        start, depth = index, 0
        while index < len(lines):
            # The allowed blocks are simple proxy/static routes, with no nested
            # quoted braces; fail closed if the opening/closing lines are malformed.
            code = lines[index].split('#', 1)[0]
            depth += code.count('{') - code.count('}')
            index += 1
            if depth == 0:
                break
        if depth != 0:
            raise ValueError('Unterminated workbench block')
        blocks.append((start, index, match.group(1), match.group(2)))
    if not blocks:
        if text.count(INCLUDE) == 1:
            return text
        raise ValueError('Expected known HTTP workbench routes or one shared include')
    if len(blocks) != 3 or {block[3] for block in blocks} != TARGETS or INCLUDE in text:
        raise ValueError('Unexpected HTTP workbench route set')
    output, cursor = [], 0
    for number, (start, end, indent, _) in enumerate(blocks):
        output.extend(lines[cursor:start])
        if number == 0:
            output.append(indent + INCLUDE + '\n')
        cursor = end
    output.extend(lines[cursor:])
    return ''.join(output)


def write(path, content):
    temporary = path.with_name(path.name + '.haoyi-next')
    temporary.write_text(content)
    os.chmod(temporary, 0o644)
    temporary.replace(path)


def main(mode):
    source, saved = CONF / NAME, BACKUP / NAME
    if mode == 'backup':
        if saved.exists() or (BACKUP / (NAME + '.absent')).exists():
            raise ValueError('HTTP rollback baseline already exists')
        if source.exists():
            # Validate before accepting a rollback baseline or stopping services.
            normalize(source.read_text())
            saved.write_bytes(source.read_bytes())
            os.chmod(saved, 0o600)
        else:
            (BACKUP / (NAME + '.absent')).touch(mode=0o600)
    elif mode == 'activate':
        if source.exists():
            write(source, normalize(source.read_text()))
    else:
        if saved.exists():
            write(source, saved.read_text())
        elif not (BACKUP / (NAME + '.absent')).exists():
            raise ValueError('Separate HTTP rollback baseline missing')
        for path in [CONF / 'affiliate-workbench.locations.inc', source]:
            if path.exists():
                content = path.read_text().replace('http://affiliate-workbench-api:8000/', 'http://affiliate-workbench-api-rollback:8000/')
                write(path, content)
    print('Legacy HTTP entry ' + mode + ' prepared; configuration contents withheld.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['backup', 'activate', 'restore'])
    try:
        main(parser.parse_args().mode)
    except Exception as error:  # noqa: BLE001 -- configuration contents must not enter diagnostic output.
        raise SystemExit(f'Legacy HTTP route operation failed ({type(error).__name__}); inspect retained baseline.') from None
