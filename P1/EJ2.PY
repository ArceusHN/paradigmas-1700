import flet as ft

def main(page: ft.Page):
    page.title = "Paradigmas"
    page.theme_mode = ft.ThemeMode.DARK

    txtMiTexto = ft.Text('Bienvenido a Paradigmas 1700', size=30, color='white')
    page.update()
    page.add(txtMiTexto)
    page.add(
        ft.RadioGroup(
            content=ft.Column(
                controls=[
                    ft.Row(controls=[
                        ft.Text('Texto_1', size=20, color=ft.Colors.BLUE_800),
                        ft.Radio(value="1"),
                    ]),
                    ft.Row(controls=[
                        ft.Text('Texto_2', size=18, color='red'),
                        ft.Radio(value="2"),
                    ]),
                    ft.Row(controls=[
                        ft.Text('Texto_3', size=16, color='green'),
                        ft.Radio(value="3"),
                    ]),
                ]
            )
        )
    )

ft.run(main, view=ft.AppView.WEB_BROWSER)
