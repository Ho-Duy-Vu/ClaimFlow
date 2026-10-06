import os
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    """Set background color of a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=120, bottom=120, left=150, right=150):
    """Set cell padding in twips."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for margin, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{margin}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table, color="D0D5DD", sz="4", val="single"):
    """Set subtle borders for table."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideV w:val="none"/>'
        f'<w:left w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def add_styled_paragraph(doc, text, style='Normal', space_after=6, space_before=0, line_spacing=1.15):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.line_spacing = line_spacing
    
    # Parse bold (**text**) and italic (*text*)
    # Simple regex parsing for markdown formatting
    parts = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', text)
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            run = p.add_run(part[2:-2])
            run.bold = True
            run.font.name = 'Calibri'
        elif part.startswith('*') and part.endswith('*'):
            run = p.add_run(part[1:-1])
            run.italic = True
            run.font.name = 'Calibri'
        elif part.startswith('`') and part.endswith('`'):
            run = p.add_run(part[1:-1])
            run.font.name = 'Consolas'
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(19, 66, 111)
        else:
            run = p.add_run(part)
            run.font.name = 'Calibri'
    return p

def convert_md_to_docx(md_path, docx_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    doc = Document()
    
    # Page setup - 1 inch margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.9)
        section.bottom_margin = Inches(0.9)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        
    # Color palette
    NAVY = RGBColor(19, 66, 111)       # #13426F Deep Harbor
    TEAL = RGBColor(14, 116, 144)      # Accent
    CHARCOAL = RGBColor(33, 37, 41)    # Body text
    MUTED = RGBColor(100, 116, 139)    # Subtitles / meta
    
    i = 0
    n = len(lines)
    
    in_code_block = False
    code_lines = []
    
    while i < n:
        line = lines[i].rstrip('\r\n')
        
        # Check code block
        if line.startswith('```'):
            if in_code_block:
                # End of code block
                in_code_block = False
                code_text = '\n'.join(code_lines)
                table = doc.add_table(rows=1, cols=1)
                table.alignment = WD_TABLE_ALIGNMENT.CENTER
                cell = table.cell(0, 0)
                set_cell_background(cell, 'F1F5F9')
                set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
                cp = cell.paragraphs[0]
                cp.paragraph_format.space_after = Pt(2)
                cp.paragraph_format.space_before = Pt(2)
                r = cp.add_run(code_text)
                r.font.name = 'Consolas'
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(30, 41, 59)
                p_spacer = doc.add_paragraph()
                p_spacer.paragraph_format.space_after = Pt(4)
                code_lines = []
            else:
                in_code_block = True
                code_lines = []
            i += 1
            continue
            
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue
            
        # Blank line
        if not line.strip():
            i += 1
            continue
            
        # Horizontal rule
        if line.strip() in ['---', '***', '___']:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(8)
            p_run = p.add_run('━' * 60)
            p_run.font.color.rgb = RGBColor(208, 213, 221)
            p_run.font.size = Pt(8)
            i += 1
            continue
            
        # Table detection
        if line.strip().startswith('|') and line.strip().endswith('|'):
            # Collect table lines
            table_lines = []
            while i < n and lines[i].strip().startswith('|') and lines[i].strip().endswith('|'):
                table_lines.append(lines[i].strip())
                i += 1
                
            if len(table_lines) >= 2:
                # Parse headers and rows
                header_row = [c.strip() for c in table_lines[0].strip('|').split('|')]
                # Skip separator line (table_lines[1])
                data_rows = []
                for tline in table_lines[2:]:
                    row_data = [c.strip() for c in tline.strip('|').split('|')]
                    # Handle cell counts mismatch
                    if len(row_data) < len(header_row):
                        row_data += [''] * (len(header_row) - len(row_data))
                    elif len(row_data) > len(header_row):
                        row_data = row_data[:len(header_row)]
                    data_rows.append(row_data)
                    
                table = doc.add_table(rows=len(data_rows) + 1, cols=len(header_row))
                table.alignment = WD_TABLE_ALIGNMENT.CENTER
                set_table_borders(table, color="CBD5E1")
                
                # Header row styling
                hdr_cells = table.rows[0].cells
                for col_idx, text in enumerate(header_row):
                    cell = hdr_cells[col_idx]
                    set_cell_background(cell, '13426F')
                    set_cell_margins(cell, top=140, bottom=140, left=140, right=140)
                    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_after = Pt(0)
                    p.paragraph_format.space_before = Pt(0)
                    p.paragraph_format.line_spacing = 1.1
                    run = p.add_run(text.replace('**', ''))
                    run.bold = True
                    run.font.name = 'Calibri'
                    run.font.size = Pt(10)
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    
                # Data rows styling
                for r_idx, rdata in enumerate(data_rows):
                    row_cells = table.rows[r_idx + 1].cells
                    bg = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
                    for c_idx, val in enumerate(rdata):
                        cell = row_cells[c_idx]
                        set_cell_background(cell, bg)
                        set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
                        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
                        p = cell.paragraphs[0]
                        p.paragraph_format.space_after = Pt(0)
                        p.paragraph_format.space_before = Pt(0)
                        p.paragraph_format.line_spacing = 1.15
                        
                        # Parse inner formatting
                        # Replace <br> with newline
                        clean_val = val.replace('<br>', '\n')
                        parts = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', clean_val)
                        for part in parts:
                            if not part:
                                continue
                            if part.startswith('**') and part.endswith('**'):
                                run = p.add_run(part[2:-2])
                                run.bold = True
                                run.font.name = 'Calibri'
                                run.font.size = Pt(9.5)
                            elif part.startswith('*') and part.endswith('*'):
                                run = p.add_run(part[1:-1])
                                run.italic = True
                                run.font.name = 'Calibri'
                                run.font.size = Pt(9.5)
                            elif part.startswith('`') and part.endswith('`'):
                                run = p.add_run(part[1:-1])
                                run.font.name = 'Consolas'
                                run.font.size = Pt(9)
                                run.font.color.rgb = NAVY
                            else:
                                run = p.add_run(part)
                                run.font.name = 'Calibri'
                                run.font.size = Pt(9.5)
                                run.font.color.rgb = CHARCOAL
                                
                p_spacer = doc.add_paragraph()
                p_spacer.paragraph_format.space_after = Pt(6)
            continue
            
        # Title (H1: # )
        if line.startswith('# '):
            title_text = line[2:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(4)
            run = p.add_run(title_text)
            run.bold = True
            run.font.name = 'Calibri'
            run.font.size = Pt(22)
            run.font.color.rgb = NAVY
            i += 1
            continue
            
        # Subtitle (H2: ## )
        if line.startswith('## '):
            h2_text = line[3:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(14)
            p.paragraph_format.space_after = Pt(6)
            run = p.add_run(h2_text)
            run.bold = True
            run.font.name = 'Calibri'
            run.font.size = Pt(15)
            run.font.color.rgb = NAVY
            i += 1
            continue
            
        # Section (H3: ### )
        if line.startswith('### '):
            h3_text = line[4:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            run = p.add_run(h3_text)
            run.bold = True
            run.font.name = 'Calibri'
            run.font.size = Pt(12.5)
            run.font.color.rgb = TEAL
            i += 1
            continue
            
        # Bullet list item
        if line.strip().startswith('* ') or line.strip().startswith('- '):
            bullet_text = line.strip()[2:].strip()
            indent_level = len(line) - len(line.lstrip())
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            p.paragraph_format.left_indent = Inches(0.25 + (indent_level // 2) * 0.2)
            
            parts = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', bullet_text)
            for part in parts:
                if not part:
                    continue
                if part.startswith('**') and part.endswith('**'):
                    run = p.add_run(part[2:-2])
                    run.bold = True
                    run.font.name = 'Calibri'
                elif part.startswith('*') and part.endswith('*'):
                    run = p.add_run(part[1:-1])
                    run.italic = True
                    run.font.name = 'Calibri'
                elif part.startswith('`') and part.endswith('`'):
                    run = p.add_run(part[1:-1])
                    run.font.name = 'Consolas'
                    run.font.size = Pt(10)
                    run.font.color.rgb = NAVY
                else:
                    run = p.add_run(part)
                    run.font.name = 'Calibri'
            i += 1
            continue
            
        # Numbered list item
        m_num = re.match(r'^(\d+)\.\s+(.*)$', line.strip())
        if m_num:
            num_idx = m_num.group(1)
            num_text = m_num.group(2)
            indent_level = len(line) - len(line.lstrip())
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.line_spacing = 1.15
            p.paragraph_format.left_indent = Inches(0.25 + (indent_level // 2) * 0.2)
            
            run_num = p.add_run(f"{num_idx}. ")
            run_num.bold = True
            run_num.font.name = 'Calibri'
            run_num.font.color.rgb = NAVY
            
            parts = re.split(r'(\*\*.*?\*\*|\*.*?\*|`.*?`)', num_text)
            for part in parts:
                if not part:
                    continue
                if part.startswith('**') and part.endswith('**'):
                    run = p.add_run(part[2:-2])
                    run.bold = True
                    run.font.name = 'Calibri'
                elif part.startswith('*') and part.endswith('*'):
                    run = p.add_run(part[1:-1])
                    run.italic = True
                    run.font.name = 'Calibri'
                elif part.startswith('`') and part.endswith('`'):
                    run = p.add_run(part[1:-1])
                    run.font.name = 'Consolas'
                    run.font.size = Pt(10)
                    run.font.color.rgb = NAVY
                else:
                    run = p.add_run(part)
                    run.font.name = 'Calibri'
            i += 1
            continue
            
        # Blockquote (> text)
        if line.strip().startswith('>'):
            quote_text = line.strip().lstrip('>').strip()
            table = doc.add_table(rows=1, cols=1)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            cell = table.cell(0, 0)
            set_cell_background(cell, 'F0F7FF')
            set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
            # Add left border accent
            tcPr = cell._tc.get_or_add_tcPr()
            tcBorders = parse_xml(
                f'<w:tcBorders {nsdecls("w")}>'
                f'<w:left w:val="single" w:sz="24" w:space="0" w:color="13426F"/>'
                f'<w:top w:val="none"/>'
                f'<w:bottom w:val="none"/>'
                f'<w:right w:val="none"/>'
                f'</w:tcBorders>'
            )
            tcPr.append(tcBorders)
            qp = cell.paragraphs[0]
            qp.paragraph_format.space_after = Pt(2)
            qp.paragraph_format.space_before = Pt(2)
            q_run = qp.add_run(quote_text.replace('**', '').replace('*', ''))
            q_run.italic = True
            q_run.font.name = 'Calibri'
            q_run.font.size = Pt(10.5)
            q_run.font.color.rgb = NAVY
            p_spacer = doc.add_paragraph()
            p_spacer.paragraph_format.space_after = Pt(4)
            i += 1
            continue
            
        # Regular paragraph
        add_styled_paragraph(doc, line.strip(), space_after=5, line_spacing=1.15)
        i += 1
        
    doc.save(docx_path)
    print(f"Successfully generated: {docx_path}")

if __name__ == '__main__':
    base_dir = r"c:\Project\AI-Claims-Processing-Assistant"
    
    file1_md = os.path.join(base_dir, "BAN_DRAFT_Y_TUONG_DU_AN_CLAIMFLOW.md")
    file1_docx = os.path.join(base_dir, "BAN_DRAFT_Y_TUONG_DU_AN_CLAIMFLOW.docx")
    
    file2_md = os.path.join(base_dir, "KE_HOACH_TIEP_THEO_CLAIMFLOW.md")
    file2_docx = os.path.join(base_dir, "KE_HOACH_TIEP_THEO_CLAIMFLOW.docx")
    
    convert_md_to_docx(file1_md, file1_docx)
    convert_md_to_docx(file2_md, file2_docx)
