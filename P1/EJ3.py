import flet as ft


def main(page: ft.Page):
    page.title = "Mi Página Web"
    page.padding = 0
    page.bgcolor = ft.Colors.WHITE
    page.window_width = 1000
    page.window_height = 650

    header = ft.Container(
        content=ft.Row(
            [
                ft.Text("Mi Sitio Web", size=22, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE),
            ],
            alignment=ft.MainAxisAlignment.START,
        ),
        bgcolor=ft.Colors.BLUE_GREY_800,
        padding=ft.Padding(left=20, right=20, top=15, bottom=15),
        height=60,
    )

    sidebar = ft.Container(
        content=ft.Column(
            [
                ft.TextButton(
                    "Inicio",
                    style=ft.ButtonStyle(color=ft.Colors.RED),
                ),
                ft.Divider(height=20, color=ft.Colors.BLACK),
                ft.TextButton(
                    "Servicios",
                    style=ft.ButtonStyle(color=ft.Colors.RED),
                ),
                ft.Divider(height=20, color=ft.Colors.BLACK),
                ft.TextButton("Contacto", style=ft.ButtonStyle(color=ft.Colors.BLACK)),
                ft.Divider(height=20, color=ft.Colors.BLACK),
                ft.TextButton("Acerca de", style=ft.ButtonStyle(color=ft.Colors.BLACK)),
            ],
            spacing=10,
        ),
        width=200,
        bgcolor=ft.Colors.GREY_100,
        padding=20,
        border_radius=ft.BorderRadius.all(20),
        expand=True,
    )

    card_1 = ft.Container(
        content=ft.Row(
            controls=[
                ft.Container(
                    content=ft.Text(
                        "Bienvenido a mi sitio web. Aquí encontrarás información sobre nuestros servicios y cómo contactarnos.",
                        size=14,
                    ),
                    bgcolor=ft.Colors.BLACK,
                    height=150,
                ),
            ],
        ),
        bgcolor=ft.Colors.WHITE,
        padding=20,
        border_radius=5,
        height=160,
    )

    card_2 = ft.Container(
        content=ft.Row(
            controls=[
                ft.Container(
                    content=ft.Text(
                        "Bienvenido a mi sitio web. Aquí encontrarás información sobre nuestros servicios y cómo contactarnos.",
                        size=14,
                    ),
                    bgcolor=ft.Colors.BLACK,
                    height=150,
                ),
            ],
        ),
        bgcolor=ft.Colors.WHITE,
        padding=20,
        border_radius=5,
        height=160,
    )

    main_content = ft.Container(
        content=ft.Column(
            [card_1, card_2],
            spacing=20,
        ),
        padding=20,
        expand=True,
     )

    right_panel = ft.Container(
        content=ft.Column(
            [
                ft.Text("Panel", size=18, weight=ft.FontWeight.BOLD),
                ft.Divider(),
                ft.Text("Noticias", size=14),
                ft.Text("Enlaces", size=14),
                ft.Text("Contacto", size=14),
            ],
            spacing=10,
        ),
        width=180,
        bgcolor=ft.Colors.GREY_50,
        padding=20,
         expand=True,
    )

    body = ft.Row(
        [sidebar, main_content, right_panel],
        spacing=0,
        expand=True,
    )

    page.add(
        ft.Column(
            [header, body],
            spacing=0,
            expand=True,
        )
    )


ft.app(main)
